# ⛈️ StormFlow Designer 浪涌流管网：Cloudflare Pages / Workers & D1 数据库部署指南

本项目已全面升级为包含**轻量级边缘全栈架构 (Edge Full-Stack)**的生产就绪应用。系统通过 **Cloudflare Pages Functions** 在边缘端高效托管 API 路由，并通过 **Cloudflare D1 分布式 SQL 数据库** 实现管段元素、拓扑结构、汇水区域、Chicago降雨强度模型以及数字孪生全系列数据的高性能版本容灾与云同步。

为了保证开发体验与发布一致性，我们在本地集成了**高保真 D1 本地数据库模拟中间件**，您无需启动外部服务即可在本地热启动并进行同步测试。

---

## 🛠️ 第一部分：高保真本地 D1 开发与仿真引擎

为了能在 AI Studio 开发沙箱中提供即时、响应极速的测试体验，我们在 `/vite.config.ts` 中植入了精密的 **Local Cloudflare D1 Emulator**:
1. 本地启动 `npm run dev` 时，Vite 服务器会自动代理拦截所有发往 `/api/scenarios` (GET / POST / DELETE) 的请求。
2. 同步数据会被原子增量保存或提取自根目录下的 `scenarios_db.json` 物理文件，完美保留了边缘端事务及查询交互语义。
3. 您可以点击顶部的 **"D1 云端剧本"** 触发云服务控制模态框，保存、搜索或秒级回滚当前设计模型快照，享受毫无差别的全栈双轴模拟体验。

---

## ☁️ 第二部分：Cloudflare 生产端部署步骤

将本应用部署至 Cloudflare 包含两个主要部分：创建云端地理分布式 D1 数据库实例，以及利用 Wrangler 或者 Cloudflare Dashboard 触发一键全栈打包上传。

### 步骤 1：本地准备与 Cloudflare 账户登录
在本地开发环境或终端中，请首先全局安装 `wrangler` 命令行开发工具并进行身份验证授权：
```bash
# 全局安装 CF 开发者工具集
npm install -g wrangler

# 登录授权 Cloudflare 账户（可在浏览器中一键登录）
wrangler login
```

### 步骤 2：创建 Cloudflare D1 关系型数据库实例
D1 是 Cloudflare 提供的超低能耗、全托管、零并发瓶颈的边缘 SQL 数据库。启动以下命令来为您创建管网云端备份空间：
```bash
# 创建 D1 数据库实例并命名为 storm-db
wrangler d1 create storm-db
```
执行完毕后，终端会打印出类似如下的数据库元数据（包含您专属的 Database ID）：
```text
✅ Successfully created database 'storm-db'!

💡 Add the following to your wrangler.toml to bind to 'DB':

[[d1_databases]]
binding = "DB"
database_name = "storm-db"
database_id = "419b3abb-8f0c-45ee-9ec7-0526d07e32f3"
```

### 步骤 3：绑定 `wrangler.toml` 配置文件
请打开项目根目录下的 `wrangler.toml` 配置文件，将其中的 `database_id` 替换为上面步骤 2 中为您真实分配获得的 ID。
```toml
# wrangler.toml
name = "stormpipelinev1"
pages_build_output_dir = "dist"
compatibility_date = "2026-06-02"

[assets]
directory = "./dist"
not_found_handling = "single-page-application"

[vars]
NODE_VERSION = "20"

[[d1_databases]]
binding = "DB"             # 本代码强制绑定变量，不可修改
database_name = "storm-db"   # 绑定你在 Cloudflare 创建的 D1 数据库名称
database_id = "你的-D1-DATABASE-ID" # 替换为您上面获取到的真实 UUID 密匙
```

### 步骤 4：自动化学案表结构初始化
您**无需**在云端控制台编写繁复的表结构。我们已经在 `/functions/api/scenarios.ts` 边缘脚本中为您集成了 **Automagic Schema Bootstrapper**:
> 系统在接收到第一次客户端的 `GET` 或 `POST` 网络流动作时，会自动核实、创建不存在的 4 张拓扑结构表，并在原有方案中智能拓展空间范围与锚点字段。零额外心智，完全免维护启动。

---

## 🚀 第三部分：一键编译打包与高效发布

Cloudflare Pages 会自动提取 `/functions` 目录下的所有 TS/JS 边缘文件，将其静态托管与云端 Serverless 网格进行融合发布。

```bash
# 1. 执行静态物理文件与 CSS 模块高级混淆打包
npm run build

# 2. 调用 wrangler CLI 一键部署分发至 Cloudflare Pages 全球 CDN 中
npm run deploy
```
发布命令完成后，Wrangler 会自动在终端底部吐出类似：
`✨ Deployment complete! Take a look at: https://stormflow-designer.pages.dev` 
现在，您的全栈雨水管网智能纠偏数字孪生应用，便已拥有了安全可靠、超高吞吐、永远不宕机的边缘算力守护！

---

## 🗃️ 第四部分：D1 分布式底层数据库表结构参考 (SQL schema)

如果您希望在 Cloudflare D1 管理后台微调或者检索原始管网数据，以下是边缘函数在云端执行自动化建表时的标准物理模型架构，提供给您作数据开发规划：

```sql
-- 1. 剧本元信息汇总主表
CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,                       -- 孪生剧本主键 ID (UUID)
  name TEXT NOT NULL,                        -- 剧本版本标志性俗名
  description TEXT,                         -- 修改原因、方案调优日志备注
  boundary_polygon_json TEXT,                -- 片区雨水管线规划规划红范围 GeoJSON coordinates
  spatial_anchor_json TEXT,                  -- 投影变换绝对经纬度锚点
  created_at TEXT DEFAULT CURRENT_TIMESTAMP  -- 版本落库时间撮记录
);

-- 2. 排水检查井、溢流口、汇水节点子表
CREATE TABLE IF NOT EXISTS network_nodes (
  id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,                 -- 外键约束
  type TEXT,                                 -- 'manhole'、'outfall'、'storage'
  lat REAL, lng REAL,                        -- 物理地理经纬度
  x REAL, y REAL,                            -- CGCS2000 大地直角三维地理平面直角投影坐标轴数值
  elevation REAL,                            -- 地表绝对海拔
  bottomElevation REAL,                      -- 井底或管底标高 (重力充溢流起点高程)
  groundElevation REAL,                      -- 检查井井口高程 (路面设计高程)
  maxDepth REAL,                             -- 井体覆土极限孔深 (m)
  name TEXT,                                 -- 工程编号 (例如 MH-1)
  waterLevel REAL,                           -- 模拟输出流过水位
  overflowRate REAL,                         -- 最大动力学积水流出速率 (L/s)
  PRIMARY KEY (id, scenario_id),
  FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
);

-- 3. 重力暗渠、雨水主管、联接管道子表
CREATE TABLE IF NOT EXISTS network_links (
  id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  fromNodeId TEXT, toNodeId TEXT,            -- 上下游结点工程主键
  source TEXT, target TEXT,                  -- 拓扑逻辑有向线段源和靶
  length REAL,                               -- 物理管路径流长度 (m)
  diameter REAL,                             -- 截面管径大小 (例如 DN400 - DN1200)
  height REAL,                               -- 通水断面截面高度值
  shape TEXT,                                -- 'circular' (圆形断面)、'box' (箱涵)等规格
  material TEXT,                             -- 'HDPE'、'PE'、'Concrete' (钢筋混凝土非金属管)材料
  roughness REAL,                            -- 曼宁阻力摩擦粗糙度常数 (n)
  name TEXT,                                 -- 工程主管命名 (例如 P-1)
  slope REAL,                                -- 水力物理平均坡度 (‰ 比降分数值)
  PRIMARY KEY (id, scenario_id),
  FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
);

-- 4. 径流产汇水区、汇水片区划分子表
CREATE TABLE IF NOT EXISTS network_catchments (
  id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  name TEXT,                                 -- 汇水区编号
  area REAL,                                 -- 投影测绘平面汇水面积 (公顷 ha)
  runoffCoefficient REAL,                    -- 产流综合渗漏折减产流系数 (0.1 ~ 0.95)
  runOffCoef REAL,                           -- 对应底层兼容属性
  timeOfConcentration REAL,                  -- 集水降雨历时 (min)
  outletNodeId TEXT, nodeCtx TEXT,           -- 雨水流出排放指向井点
  polygon_vertices TEXT,                     -- 局部片状封闭轮廓多边形极坐标序列 JSON geometry
  PRIMARY KEY (id, scenario_id),
  FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
);
```

现在，尽情体验兼备边缘计算与极简多端合规协作的 **StormFlow 城市排涝大师** 吧！
