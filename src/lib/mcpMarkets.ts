// 2026-09-27 从国内 MCP 广场抄下的目录。页面只读这份本地数据，不再请求这些网站。
// 这里没有启动命令、地址和密钥。登记连接器仍走上面的表单，只填名字。
export type McpMarket = {
  id: string;
  name: string;
  operator: string;
  host: string;
  summary: string;
  fit: string;
  note: string;
};

export type McpMarketEntry = {
  id: string;
  name: string;
  summary: string;
  marketId: string;
  hosted: boolean;
};

export const MCP_MARKETS: McpMarket[] = [
  {
    "id": "modelscope",
    "name": "魔搭社区",
    "operator": "阿里云",
    "host": "modelscope.cn/mcp",
    "summary": "中文开源社区里的 MCP 广场，可以云托管，也可以在本地启动。",
    "fit": "想先看开源服务、做对比的时候从这里找。",
    "note": "首页可以打开。这次没有拉到公开的分页清单，所以下面不展开它的服务。"
  },
  {
    "id": "bailian",
    "name": "阿里云百炼",
    "operator": "阿里云",
    "host": "bailian.console.aliyun.com",
    "summary": "精选过的托管服务，开通后用 Streamable HTTP 调用，密钥放在环境变量里。",
    "fit": "已经在用阿里云、希望少自己运维的时候看这里。",
    "note": "控制台可以打开。清单在登录后的市场里，这次没有整表抄下来。"
  },
  {
    "id": "mcpworld",
    "name": "百度智能云 MCP World",
    "operator": "百度智能云",
    "host": "mcpworld.com",
    "summary": "面向企业的广场，服务可以托管在千帆上。",
    "fit": "需要企业托管和检索入口时看这里。",
    "note": "首页可以打开。这次没有拉到公开的分页清单。"
  },
  {
    "id": "tencent",
    "name": "腾讯云 MCP 广场",
    "operator": "腾讯云",
    "host": "cloud.tencent.com/developer/mcp",
    "summary": "腾讯产品和第三方服务，分本地安装和云托管两种。",
    "fit": "要用微信、腾讯云或腾讯文档这一类能力时看这里。",
    "note": "2026-09-27 读到 1050 个服务。下面列出腾讯产品分类和搜到的企查查，不是全量。"
  },
  {
    "id": "xfyun",
    "name": "讯飞星辰",
    "operator": "科大讯飞",
    "host": "mcp.xfyun.cn/pages/square",
    "summary": "讯飞的广场，语音识别、语音合成和星火模型是它的重点。",
    "fit": "任务要听和说的时候看这里。",
    "note": "广场页可以打开。这次没有拉到公开的分页清单。"
  },
  {
    "id": "mcpmarket",
    "name": "MCP 星球",
    "operator": "第三方收录",
    "host": "mcpmarket.cn",
    "summary": "把各家广场收在一起的目录，自己不托管，真正使用还要回到来源。",
    "fit": "想按名字找国内常见服务时，用它当索引。",
    "note": "2026-09-27 接口返回 68134 条。下面只保留按名字搜到的国内常用服务。"
  },
  {
    "id": "aibase",
    "name": "AIbase",
    "operator": "第三方收录",
    "host": "mcp.aibase.com/zh/explore",
    "summary": "中文整理的 MCP 仓库和说明，方便对照 GitHub 上的项目。",
    "fit": "要看中文说明和案例时从这里读。",
    "note": "探索页可以打开。这次没有把仓库清单抄进页面。"
  },
  {
    "id": "iflow",
    "name": "心流开放平台",
    "operator": "心流",
    "host": "platform.iflow.cn/mcp",
    "summary": "展示服务，并给出阅读量和收藏量，方便看哪些更常被打开。",
    "fit": "想参考别人常用哪些服务时看这里。",
    "note": "页面可以打开。未登录接口不返回清单，所以没有抄服务。"
  }
];

export const MCP_MARKET_ENTRIES: McpMarketEntry[] = [
  {
    "id": "tencent-1",
    "name": "云开发MCP",
    "summary": "云开发 CloudBase 是专为 AI Coding 提供的 AI 原生后端服务，通过 MCP 可以获得数据库、登录认证、云函数、容器托管、…",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-2",
    "name": "TDesign MCP Server",
    "summary": "TDesign MCP Server 是一个功能强大的工具，旨在支持组件库的开发和使用。它提供四个核心功能：1) get-component-…",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-3",
    "name": "EdgeOne Pages",
    "summary": "基于 EdgeOne Pages 的 MCP 服务器，支持代码部署为在线页面。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-4",
    "name": "腾讯云TAPD MCP Server",
    "summary": "与 TAPD API 无缝集成，提升开发效率。TAPD 是腾讯敏捷研发管理平台，覆盖需求、计划、研发、测试、发布研发全生命周期。支持用自然语言…",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-5",
    "name": "腾讯文档MCP",
    "summary": "腾讯文档 MCP 提供了一套完整的在线文档操作工具，支持创建、查询、编辑多种类型的在线文档。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-6",
    "name": "腾讯云日志服务CLS",
    "summary": "通过 MCP Server 查询日志服务 CLS 中存储的日志数据，以实现大模型平台/工具与日志数据的结合。例如使用自然语言查询日志，降低日志…",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-7",
    "name": "元宝搜索MCP",
    "summary": "元宝搜索MCP基于腾讯云元宝搜索服务（Tencent Yuanbao Search，wsa）封装而成，以互联网全网公开资源为基础，叠加腾讯优质…",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-8",
    "name": "腾讯位置服务",
    "summary": "腾讯位置服务 MCP Server，基于MCP协议的腾讯位置服务接口。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-9",
    "name": "腾讯云代码分析（TCA）",
    "summary": "基于MCP协议的腾讯云代码分析MCP Server，精准跟踪管理代码分析发现的代码质量缺陷、代码规范、代码安全漏洞、无效代码，以及度量代码复杂…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-10",
    "name": "文字识别 OCR-通用文字识别（高精度版）MCP",
    "summary": "支持图像整体文字的检测和识别，返回文字框位置与文字内容。",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-11",
    "name": "腾讯云对象存储COS",
    "summary": "基于 MCP 协议的腾讯云 COS MCP Server，无需编码即可让大模型快速接入腾讯云存储 (COS) 和数据万象 (CI) 能力。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-12",
    "name": "腾讯乐享MCP",
    "summary": "让 AI 助手、Agent 能够直接与您的乐享知识库进行交互。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-13",
    "name": "腾讯云Lighthouse MCP Server",
    "summary": "基于腾讯云 Lighthouse API 开发的 MCP(Model Context Protocol) 服务器，用于与 AI 大模型进行交互…",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-14",
    "name": "文字识别 OCR-文档抽取(多模态版) MCP",
    "summary": "文档智能（Document AI）​​ 深度融合 OCR 与多模态大模型，实现高精度识别、智能解析与结构化信息抽取。",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-15",
    "name": "威胁情报MCP",
    "summary": "​​腾讯云安全威胁情报 MCP（Model Context Protocol）服务基于MCP协议提供标准化威胁情报查询服务接口，支持IP、域名…",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-16",
    "name": "腾讯云CVM MCP服务器",
    "summary": "腾讯云 CVM（Cloud Virtual Machine）MCP Server 实现，用于在支持 MCP 的客户端中直接管理腾讯云实例与网络…",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-17",
    "name": "腾讯混元生图 MCP",
    "summary": "腾讯混元生图是一款提供 AI 图像生成与处理能力的 API 技术服务，可以结合输入的文本或图像智能创作图像内容，具有更精美的绘图品质、更强大的…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-18",
    "name": "腾讯位置大数据MCP",
    "summary": "腾讯位置大数据 MCP server，为开发者提供人群统计、画像分析等全方位的人口大数据能力。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-19",
    "name": "CloudStudio MCP",
    "summary": "基于CloudStudio的 MCP服务器，支持代码上传至CloudStudio，部署并预览",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-20",
    "name": "云数据库 TencentDB for MySQL MCP",
    "summary": "腾讯云数据库 MySQL（TencentDB for MySQL）为用户提供安全可靠，性能卓越、易于维护的企业级云数据库服务。",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-21",
    "name": "实时音视频 MCP",
    "summary": "Tencent RTC MCP专为增强大语言模型（LLM） 对腾讯云实时音视频（TRTC） 产品的理解和交互而设计，助力AI代理将腾讯云实时音…",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-22",
    "name": "腾讯云自动化助手TAT MCP Server",
    "summary": "腾讯云 TAT（TencentCloud Automation Tools）MCP Server，用于在支持 MCP 的客户端中直接在腾讯云实…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-23",
    "name": "WeData指标语义层MCP",
    "summary": "基于WeData Unity Semantics MCP服务器，快速实现数据分析智能体，支持数据检索、数据查询等能力",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-24",
    "name": "CODING DevOps MCP Server",
    "summary": "CODING DevOps MCP Server 是一个基于 Model Context Protocol (MCP) 的服务器实现，旨在与 …",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-25",
    "name": "云点播 VOD MCP",
    "summary": "面向音视频、图片等媒体，提供制作上传、存储、转码、媒体处理、媒体 AI、加速分发播放、版权保护等一体化的高品质媒体服务。",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-26",
    "name": "DNSPod MCP",
    "summary": "基于DNSPod解析的MCP服务器，支持快速添加域名、查看解析记录、查看解析用量",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-27",
    "name": "云函数 SCF MCP",
    "summary": "云函数（Serverless Cloud Function，SCF）是腾讯云为企业和开发者们提供的无服务器执行环境，帮助您在无需购买和管理服务…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-28",
    "name": "腾讯云 BI MCP",
    "summary": "腾讯云BI（Business Intelligence）提供从数据源接入、数据建模到数据可视化分析全流程的BI能力，仅需简单拖拽即可完成复杂的…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-29",
    "name": "容器服务 TKE MCP",
    "summary": "腾讯云容器服务(TKE) Model Context Protocol (MCP) 服务器，提供标准化的TKE集群管理接口。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-30",
    "name": "TDSQL-C MySQL MCP",
    "summary": "TDSQL-C MySQL 版（TDSQL-C for MySQL）是腾讯云自研的新一代云原生关系型数据库。",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-31",
    "name": "负载均衡 MCP",
    "summary": "负载均衡（Cloud Load Balancer，CLB）提供安全快捷的四七层流量分发服务，访问流量经由 CLB 可以自动分配到多台后端服务器…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-32",
    "name": "边缘安全加速平台 EO MCP",
    "summary": "边缘安全加速平台 EO (TencentCloud EdgeOne)基于腾讯云遍布全球的边缘节点，提供域名解析、动静态智能加速、TCP/UDP…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-33",
    "name": "向量数据库 MCP",
    "summary": "腾讯云向量数据库（Tencent Cloud VectorDB）是一款全托管的自研企业级分布式数据库服务，专用于存储、检索、分析多维向量数据。",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-34",
    "name": "腾讯云数据仓库 TCHouse-C MCP",
    "summary": "腾讯云数据仓库 TCHouse-C（ Tencent Cloud TCHouse-C ）是基于开源 OLAP 引擎 ClickHouse 打造…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-35",
    "name": "TRTC迁移助手 MCP",
    "summary": "迁移RTC厂商代码到腾讯云TRTC",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-36",
    "name": "云直播 CSS MCP",
    "summary": "云直播（Cloud Streaming Services，CSS）为您提供极速、稳定、专业的云端直播处理服务.",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-37",
    "name": "腾讯云 ES 索引 MCP",
    "summary": "腾讯云ES MCP Server可以提供自动弹性伸缩的托管 Server 服务，用户可自行开发 MCP Client 来调用该 Server，…",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-38",
    "name": "内容分发网络 CDN MCP",
    "summary": "内容分发网络（Content Delivery Network，CDN）通过将站点内容发布至遍布全球的海量加速节点，使其用户可就近获取所需内容…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-39",
    "name": "VPN 链接 MCP",
    "summary": "VPN 连接（VPN Connections）是一种基于网络隧道技术，实现本地数据中心与腾讯云上资源连通的传输服务，它能帮您在 Interne…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-40",
    "name": "腾讯云HAI MCP服务器",
    "summary": "腾讯云高性能应用服务(HAI)的MCP服务器, 支持对HAI上实例的状态查询、启动和停止等操作。",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-41",
    "name": "腾讯云弹性伸缩AS MCP Server",
    "summary": "腾讯云 AS MCP 服务器是一个用于管理腾讯云自动伸缩组及相关资源的工具。其主要功能包括自动伸缩组的全生命周期管理（创建、修改、启用和禁用）…",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-42",
    "name": "云数据库 TencentDB for MongoDB MCP",
    "summary": "腾讯云数据库 MongoDB（TencentDB for MongoDB）是腾讯云基于全球广受欢迎的 MongoDB 打造的高性能 NoSQL…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-43",
    "name": "腾讯会议 MCP",
    "summary": "能让你的agent连上腾讯会议，能管理你的会议和录制等功能",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-44",
    "name": "Private DNS MCP",
    "summary": "基于私有域解析 Private DNS 的 MCP 服务器，支持快速创建私有域、查看私有域解析详情等。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-45",
    "name": "腾讯设计 Ardot MCP",
    "summary": "Ardot MCP Server 是腾讯设计 Ardot 提供的 Model Context Protocol（MCP） 服务端实现，让 AI…",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-46",
    "name": "消息队列 CKafka 版 MCP",
    "summary": "消息队列 CKafka 版（TDMQ for CKafka）是一个分布式、高吞吐量、高可扩展性的消息系统，100%兼容开源 Kafka API…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-47",
    "name": "域名注册 MCP",
    "summary": "基于腾讯云域名注册 API 开发的 MCP，为 AI 大模型提供强大的腾讯云域名注册管理能力。支持多种工具类型和智能化的云资源操作。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-48",
    "name": "Elasticsearch Service MCP",
    "summary": "腾讯云 Elasticsearch Service（ES）是云端全托管海量数据检索分析服务，拥有高性能自研内核，集成X-Pack。",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-49",
    "name": "云硬盘 CBS MCP",
    "summary": "云硬盘（Cloud Block Storage，CBS）为您提供用于 CVM 的持久性数据块级存储服务。",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-50",
    "name": "私有网络 VPC MCP",
    "summary": "私有网络（Virtual Private Cloud，VPC）是基于腾讯云构建的专属云上网络空间，为您在腾讯云上的资源提供网络服务，不同私有网…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-51",
    "name": "云数据库 TencentDB for Redis MCP",
    "summary": "腾讯云数据库 Redis®（TencentDB for Redis®）是腾讯云打造的兼容 Redis 和 Memcached 协议的缓存和存储…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-52",
    "name": "SSL 证书 MCP",
    "summary": "基于腾讯云 SSL 证书 API 开发的 MCP，为 AI 大模型提供强大的腾讯云 SSL 证书管理能力。支持多种工具类型和智能化的云资源操作。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-53",
    "name": "消息队列 RocketMQ 版 MCP",
    "summary": "消息队列 RocketMQ 版(TDMQ for RocketMQ，简称TDMQ RocketMQ 版) 是一款分布式高可用的消息队列服务。",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-54",
    "name": "TSF 应用管理 MCP",
    "summary": "应用管理是一个围绕应用和微服务的 PaaS 平台，提供一站式应用全生命周期管理能力和数据化运营支持，提供多维度应用和服务的监控数据，帮助企业创…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-55",
    "name": "TSF 注册配置治理 MCP",
    "summary": "注册配置提供微服务与分布式场景下，云原生应用的动态服务发现、分布式配置管理和服务管理等能力。无改造、无缝平滑迁移、多语言接入等特性，助力业务轻…",
    "marketId": "tencent",
    "hosted": true
  },
  {
    "id": "tencent-56",
    "name": "腾讯云APM MCP",
    "summary": "腾讯云 APM 性能监控 MCP 服务，提供业务系统概览、指标分析、调用链追踪、火焰图剖析、日志查询等诊断工具。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-57",
    "name": "云数据库 PostgreSQL MCP",
    "summary": "把云 API 背后的实例、账号、数据库、参数、备份、监控、网络、只读实例与 SSL 等 48 个能力，统一封装为 MCP 工具。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-58",
    "name": "企查查-企业信息 MCP",
    "summary": "为企业查询提供工商维度的数据。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-59",
    "name": "企查查-风险信息 MCP",
    "summary": "为企业查询提供风险维度的数据。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-60",
    "name": "企查查-知识产权 MCP",
    "summary": "为企业查询提供知识产权维度的数据。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "tencent-61",
    "name": "企百科-企业工商信息 MCP",
    "summary": "通过 MCP 读取企业征信和工商信息。",
    "marketId": "tencent",
    "hosted": false
  },
  {
    "id": "planet-1",
    "name": "高德地图",
    "summary": "高德地图 MCP，覆盖地理编码等地图服务。广场上的登记名是 amap-maps。",
    "marketId": "mcpmarket",
    "hosted": false
  },
  {
    "id": "planet-2",
    "name": "百度地图",
    "summary": "百度地图的位置服务，提供地理空间接口。",
    "marketId": "mcpmarket",
    "hosted": false
  },
  {
    "id": "planet-3",
    "name": "滴滴出行",
    "summary": "滴滴出行的官方服务，用于出行场景的智能体。",
    "marketId": "mcpmarket",
    "hosted": false
  },
  {
    "id": "planet-4",
    "name": "飞书",
    "summary": "飞书开放接口，广场上的登记名是 lark-openapi-mcp。",
    "marketId": "mcpmarket",
    "hosted": false
  },
  {
    "id": "planet-5",
    "name": "企业微信",
    "summary": "企业微信的通讯录、待办、会议、消息、日程和文档。",
    "marketId": "mcpmarket",
    "hosted": false
  },
  {
    "id": "planet-6",
    "name": "微信读书",
    "summary": "读取微信读书。广场上的登记名是 mcp-server-weread。",
    "marketId": "mcpmarket",
    "hosted": false
  },
  {
    "id": "planet-7",
    "name": "秘塔AI搜索",
    "summary": "秘塔 AI 搜索，用来检索公开信息。",
    "marketId": "mcpmarket",
    "hosted": false
  },
  {
    "id": "planet-8",
    "name": "钉钉",
    "summary": "钉钉的通讯录、部门和通知。广场上的登记名是 dingtalk-mcp。",
    "marketId": "mcpmarket",
    "hosted": false
  },
  {
    "id": "planet-9",
    "name": "MiniMax",
    "summary": "MiniMax 官方 JavaScript 实现，覆盖语音、图像等模型能力。",
    "marketId": "mcpmarket",
    "hosted": false
  }
];
