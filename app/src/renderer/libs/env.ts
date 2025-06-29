export const isProduction = () => {
  return window.envApi.isProduction();
};

export const getBaseUrl = () => {
  return "http://localhost:3001";
};
export const getApiBaseUrl = () => {
  return "http://localhost:3001/api";
};
