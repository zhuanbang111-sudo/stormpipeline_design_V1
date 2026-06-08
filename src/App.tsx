import { useState, useCallback } from 'react';
import TopBar from './components/TopBar';
import SettingsModal from './components/SettingsModal';
import Sidebar from './components/Sidebar';
import HydraulicSidebar from './components/HydraulicSidebar';
import MapArea from './components/MapArea';
import BottomPanel from './components/BottomPanel';
import ImportModal from './components/ImportModal';
import CloudScenarioModal from './components/CloudScenarioModal';
import ChicagoRainGenerator from './components/ChicagoRainGenerator';
import NetworkValidationPanel from './components/NetworkValidationPanel';
import AdaptiveCatchmentEngine from './components/AdaptiveCatchmentEngine';
import { useNetworkStore } from './store/networkStore';
import { exportToDXF, exportReport } from './lib/exportUtils';
import { X, CloudRain } from 'lucide-react';

export default function App() {
  // 使用自定义Hook获取应用全局状态和操作函数
  const store = useNetworkStore();
  
  // 局部状态：控制设置弹窗的显示与隐藏
  const [showSettings, setShowSettings] = useState(false);
  // 局部状态：控制导入数据弹窗的显示与隐藏
  const [showImport, setShowImport] = useState(false);
  // 局部状态：控制 Cloud D1 剧本同步弹窗的显示与隐藏
  const [showCloudScenario, setShowCloudScenario] = useState(false);
  // 局部状态：存储降雨强度，默认值为50毫米/小时
  const [rainfall, setRainfall] = useState(50); // mm/hr
  
  // 局部状态：控制芝加哥暴雨发生器浮窗显示
  const [showChicagoGenerator, setShowChicagoGenerator] = useState(false);
  // 局部状态：控制水力合规性校验侧边栏显示，默认开启让用户立刻见证其威力
  const [showValidationPanel, setShowValidationPanel] = useState(true);
  // 局部状态：当前处于的 SWMM 型主设计工作流状态步骤
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<'modeling' | 'rainfall' | 'simulation' | 'evaluation'>('modeling');
  // 局部状态：控制自适应汇水区引擎展示
  const [showAdaptiveCatchment, setShowAdaptiveCatchment] = useState(false);
  
  /**
   * 处理地图点击事件
   * 根据当前选中的工具类型，执行不同的操作
   */
  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (store.selectedTool === 'add_manhole') {
      // 如果当前工具是"添加检查井"，则在点击位置添加一个检查井
      store.addNode(lat, lng, 'manhole');
    } else if (store.selectedTool === 'add_outfall') {
      // 如果当前工具是"添加排放口"，则在点击位置添加一个排放口
      store.addNode(lat, lng, 'outfall');
    } else if (store.selectedTool === 'add_catchment') {
      // 如果当前工具是"添加汇水区"，则将点击位置加入到正在绘制的多边形顶点数组中
      store.setDrawingCatchmentPoints(prev => [...prev, [lat, lng]]);
    } else if (store.selectedTool === 'select') {
      // 如果当前工具是"选择"，点击地图空白处则取消选中任何元素
      store.setSelectedElement(null);
    }
  }, [store]);

  /**
   * 处理节点（检查井/排放口）点击事件
   */
  const handleNodeClick = useCallback((id: string) => {
    if (store.selectedTool === 'select') {
      // 如果当前工具是"选择"，则选中该节点
      store.setSelectedElement({ type: 'node', id });
    } else if (store.selectedTool === 'add_pipe') {
      // 如果当前工具是"添加管线"
      if (!store.drawingLinkFrom) {
        // 如果还没有选择起点，则将当前点击的节点设为起点
        store.setDrawingLinkFrom(id);
      } else {
        // 如果已经有了起点，则将当前点击的节点设为终点，并创建管线
        store.addLink(store.drawingLinkFrom, id);
        // 创建完成后，清空起点状态，以便绘制下一条管线
        store.setDrawingLinkFrom(null);
      }
    }
  }, [store]);

  /**
   * 处理管线点击事件
   */
  const handleLinkClick = useCallback((id: string, clickX?: number, clickY?: number) => {
    if (store.selectedTool === 'select') {
      // 只有在"选择"工具下，才能选中管线
      store.setSelectedElement({ type: 'link', id });
    } else if (store.selectedTool === 'add_manhole' && clickX !== undefined && clickY !== undefined) {
      // 当处于添加检查井模式时，点击管线可以在点击处动态插入检查井并切割管网
      store.insertNodeIntoLink(id, clickX, clickY);
    }
  }, [store]);

  /**
   * 处理汇水区点击事件
   */
  const handleCatchmentClick = useCallback((id: string) => {
    if (store.selectedTool === 'select') {
      // 只有在"选择"工具下，才能选中汇水区
      store.setSelectedElement({ type: 'catchment', id });
    }
  }, [store]);

  /**
   * 处理完成汇水区绘制的事件
   * 当用户按下回车键或点击完成按钮时调用
   */
  const handleFinishCatchment = useCallback(() => {
    // 只有当绘制的点数大于等于3个（构成一个多边形）时才创建汇水区
    if (store.drawingCatchmentPoints.length >= 3) {
      // 寻找最近的节点作为汇水区的排放口 (outlet)
      // 这里为了演示，简单地取了第一个节点，实际应用中应该计算距离最近的节点
      let nearestNode = store.nodes[0];
      if (nearestNode) {
        store.addCatchment(store.drawingCatchmentPoints, nearestNode.id);
      }
    }
    // 无论是否创建成功，都清空正在绘制的点，并将工具重置为"选择"
    store.setDrawingCatchmentPoints([]);
    store.setSelectedTool('select');
  }, [store]);

  return (
    // 主容器：使用Flexbox垂直布局，占据全屏高度和宽度
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden font-sans">
      {/* 顶部工具栏组件 */}
      <TopBar 
        activeTab={activeWorkflowTab}
        onTabChange={(tab) => {
          setActiveWorkflowTab(tab);
          // If the user navigates, align auxiliary toggles
          if (tab === 'evaluation') {
            setShowValidationPanel(true);
          } else {
            setShowValidationPanel(false);
          }
        }}
        onOpenSettings={() => setShowSettings(true)} // 打开设置弹窗的回调函数
        onOpenImport={() => setShowImport(true)} // 打开导入弹窗的回调函数
        onExportDXF={() => exportToDXF(store.nodes, store.links, store.catchments)}
        onExportReport={() => exportReport(store.nodes, store.links, store.catchments, store.simulationResult)}
        onUndo={store.undo} // 撤销操作
        onRedo={store.redo} // 重做操作
        canUndo={store.canUndo} // 是否可以撤销
        canRedo={store.canRedo} // 是否可以重做
        nodes={store.nodes}
        links={store.links}
        catchments={store.catchments}
        simulationParams={store.simulationParams}
        simulationResult={store.simulationResult}
      />
      
      {/* 中间主要内容区域：水平布局，包含侧边栏和地图区域 */}
      <div className="flex flex-1 relative overflow-hidden">
        {/* 侧边栏组件：用于显示选中元素的属性 */}
        <Sidebar 
          selectedTool={store.selectedTool}
          selectedElement={store.selectedElement}
          setSelectedElement={store.setSelectedElement}
          nodes={store.nodes}
          links={store.links}
          catchments={store.catchments}
          updateNode={store.updateNode}
          updateLink={store.updateLink}
          updateCatchment={store.updateCatchment}
          deleteNode={store.deleteNode}
          deleteLink={store.deleteLink}
          deleteCatchment={store.deleteCatchment}
          clearBackgroundFeatures={store.clearBackgroundFeatures}
          backgroundFeaturesCount={store.backgroundFeatures?.length || 0}
          defaultInvertElevation={store.defaultInvertElevation}
          setDefaultInvertElevation={store.setDefaultInvertElevation}
          defaultGroundElevation={store.defaultGroundElevation}
          setDefaultGroundElevation={store.setDefaultGroundElevation}
          generateVoronoiCatchments={store.generateVoronoiCatchments}
        />
        
        {/* 地图区域组件：用于渲染地图和管网元素 */}
        <div className="flex-1 relative">
          <MapArea 
            nodes={store.nodes}
            links={store.links}
            catchments={store.catchments}
            backgroundFeatures={store.backgroundFeatures}
            selectedTool={store.selectedTool}
            selectedElement={store.selectedElement}
            drawingLinkFrom={store.drawingLinkFrom}
            drawingCatchmentPoints={store.drawingCatchmentPoints}
            simulationResult={store.simulationResult}
            onMapClick={handleMapClick}
            onNodeClick={handleNodeClick}
            onLinkClick={handleLinkClick}
            onCatchmentClick={handleCatchmentClick}
            updateNode={store.updateNode}
            updateCatchment={store.updateCatchment}
            mapType={store.simulationParams.mapType}
          />

          {/* 全网水力校验合规性已移至 ④ 结果评估右侧面板子选项中 */}

          {/* 自适应汇水区智能部署引擎 */}
          {showAdaptiveCatchment && (
            <AdaptiveCatchmentEngine onClose={() => setShowAdaptiveCatchment(false)} />
          )}
          
          {/* 如果正在绘制汇水区，在地图上方显示提示信息 */}
          {store.selectedTool === 'add_catchment' && store.drawingCatchmentPoints.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white px-4 py-2 rounded-md shadow-lg border border-gray-200 flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">Drawing catchment ({store.drawingCatchmentPoints.length} points)</span>
              <button 
                onClick={handleFinishCatchment}
                className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                Finish
              </button>
              <button 
                onClick={() => store.setDrawingCatchmentPoints([])}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
          
          {/* 如果当前工具是"添加管线"且已经选择了起点，在地图上方显示提示信息 */}
          {store.selectedTool === 'add_pipe' && store.drawingLinkFrom && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white px-4 py-2 rounded-md shadow-lg border border-gray-200 flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">Select destination node</span>
              <button 
                onClick={() => store.setDrawingLinkFrom(null)} // 取消绘制
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* 底部面板组件：用于显示模拟结果的图表和数据表格 */}
          <BottomPanel 
            simulationResult={store.simulationResult}
            nodes={store.nodes}
            links={store.links}
            catchments={store.catchments}
          />
        </div>

        {/* 右侧水力计算引擎边栏 */}
        <HydraulicSidebar 
          activeTab={activeWorkflowTab}
          params={store.simulationParams}
          setParams={store.setSimulationParams}
          runSim={store.runSim}
          nodes={store.nodes}
          links={store.links}
          catchments={store.catchments}
          onOpenChicago={() => setShowChicagoGenerator(true)}
          selectedElement={store.selectedElement}
          setSelectedElement={store.setSelectedElement}
          updateNode={store.updateNode}
          updateLink={store.updateLink}
          updateCatchment={store.updateCatchment}
          deleteNode={store.deleteNode}
          deleteLink={store.deleteLink}
          deleteCatchment={store.deleteCatchment}
          onTabChange={setActiveWorkflowTab}
        />
      </div>

      {/* 导入数据弹窗组件 */}
      <ImportModal 
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImport={store.addImportedData}
      />

      {/* D1 云数据库快照剧本管理器 */}
      <CloudScenarioModal
        isOpen={showCloudScenario}
        onClose={() => setShowCloudScenario(false)}
      />

      {/* Chicago 芝加哥暴雨雨型发生器 */}
      {showChicagoGenerator && (
        <ChicagoRainGenerator 
          onClose={() => setShowChicagoGenerator(false)}
        />
      )}

      {/* 设置弹窗：当 showSettings 为 true 时显示 */}
      {showSettings && (
        <SettingsModal 
          onClose={() => setShowSettings(false)}
          onOpenCloudScenario={() => {
            setShowSettings(false);
            setShowCloudScenario(true);
          }}
        />
      )}
    </div>
  );
}
