import https from 'https';
import fs from 'fs';

const url = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHmJPAxtl1rino81kb3_vXCEz7hO03c6Hv0W68RcFhuP6m-OIdyN6A1y7lGgEka9inXwJSzeUvxpuZlwZd55mNSZ3ntE5tu_wpCSn8zQShrfXEcIz4w4vq6jbIGUA==';

https.get(url, (res) => {
  console.log(res.headers.location);
}).on('error', console.error);
