import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const api = axios.create({ baseURL: BASE, timeout: 15000 });

export const getHealth          = ()        => api.get("/health");
export const getSchema          = ()        => api.get("/schema");
export const postPredict        = (inputs)  => api.post("/predict", { inputs });
export const postWhatIf         = (body)    => api.post("/what-if", body);
export const getMetrics         = ()        => api.get("/metrics");
export const getPsoHistory      = ()        => api.get("/pso-history");
export const getFeatureImp      = ()        => api.get("/feature-importance");
export const getTestPredictions = ()        => api.get("/test-predictions");
export const getModelInfo       = ()        => api.get("/model-info");

export default api;
