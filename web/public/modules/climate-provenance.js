export function climateModelsLabel(models = []) {
  const labels={ERA5:'ERA5','MERRA-2':'NASA POWER / MERRA-2'};
  return [...new Set(models)].map(model=>labels[model]).filter(Boolean).join('、') || '再分析数据';
}
