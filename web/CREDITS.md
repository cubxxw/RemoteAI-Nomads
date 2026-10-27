# 数据、字体与视觉来源

GeoNames： https://www.geonames.org/ ，城市数据 https://download.geonames.org/export/dump/cities15000.zip 。CC BY，经过同国家名称匹配；部分补充查询来自 https://geocoding-api.open-meteo.com/v1/search ，底层同为GeoNames。

历史气象：Open-Meteo / ECMWF ERA5， https://open-meteo.com/en/docs/historical-weather-api ，CC BY 4.0。改动为2023–2025逐日数据按日历月聚合。UTC日界线，网格重分析，非实测或未来预报。

补充历史气象：NASA POWER / MERRA-2，https://power.larc.nasa.gov/docs/methodology/meteorology/ 。使用2023–2025逐日气温、日高温与降雨，按UTC日历月聚合；来源记录保留实际模型、服务版本和网格信息。0.5°×0.625°网格可能包含周边地形，不代表具体街区；地形差异较大的已补充目的地优先采用ERA5。184城使用ERA5，166城使用MERRA-2，既有158城的气候记录保持原值。

城市分享档案：逐城保存公开来源链接和资料日期，人口等数值保留年份与行政范围。Unicode CLDR用于国家/地区语言及货币参考，https://cldr.unicode.org/ ，许可见public/city-profiles/UNICODE-LICENSE.txt。百科背景保留原页面链接，许可按来源页面说明；公开资料包不包含百科文章全文。

地图：Natural Earth，公共领域， https://www.naturalearthdata.com/about/terms-of-use/ 。本地向量轮廓由 https://github.com/nvkelso/natural-earth-vector 的1:110m数据投影生成，非法律边界声明。

字体：Inter，The Inter Project Authors，SIL OFL 1.1， https://github.com/rsms/inter 。许可随附public/fonts/OFL.txt。中文使用系统字体。

城市照片：每个文件的作者、原图和许可记录见scripts/photos.json，城市详情显示署名与原图链接。只使用已取得许可说明的真实图像。全图缩放并编码为WebP，另生成128px裁切缩略图；原图版权与许可证继续适用。

分享图片：使用上述真实照片和确定性排版。作者、原图与许可保留在配文、展开详情与原页，不印在图面。默认链接图 `public/images/share-default.png` 使用清迈照片 Nawit science / CC BY-SA 4.0；原图、裁切方式、尺寸与文件指纹见 `data/share-images.json`，不采用生成式重绘。照片的原许可继续适用，不因排版代码采用 MIT 而改变。

分享导出使用本地 qrcode-generator 2.0.4 与 fflate 0.8.3，均为 MIT。原始授权文件和来源说明分别位于 `public/vendor/qrcode/` 与 `public/vendor/fflate/`；仅在相关分享动作时加载，不请求外部图片处理服务。

城市消费：采用[CostCompass开放单项数据](https://costcompass.net/data)，CC BY 4.0。每条价格保留对应城市页面链接、观察日期、单位与采集来源；加工为城市身份匹配、字段中文显示与有日期的汇率换算，不使用其非开放月总价。

日本消费：出典为[e-Stat家计调查2025年单身家庭第1表](https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040409815&fileKind=0)，总务省统计局。加工为公开Excel解析、类别中文显示与格式转换；范围仍为全国居民单身家庭，未变成城市租金或游民消费。

汇率：来源为[ECB欧元参考汇率](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)，保留发布日期并通过同日欧元锚点计算交叉汇率。它是参考价，不是交易报价。

台湾与科索沃的SVG身份旗图以公共旗帜图形为基础，来自 https://github.com/hjnilsson/country-flags 的SVG目录。其余身份旗由系统emoji字体渲染。旗帜仅用于识别旅行目录，不表示旅行可达性或政治/法律判断。

其余研究来源、数据日期与范围见各页面和docs/architecture.md。旧城市与签证资料仍为legacy，不能因迁入D1变成重新核验的事实。

## 城市工作地图

场所数据与底图由[OpenStreetMap contributors](https://www.openstreetmap.org/copyright)提供，适用ODbL。地点文件保留OSM标识和采集日期；共享办公和咖啡馆数量按5公里半径统计。Leaflet 1.9.4使用BSD 2-Clause许可，完整许可保存在`public/vendor/leaflet/LICENSE`。
