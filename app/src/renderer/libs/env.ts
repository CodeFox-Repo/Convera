export const isProduction = () => {
  return window.envApi.isProduction();
};

export const getBaseUrl = () => {
  return window.envApi.isProduction()
    ? "https://api.foxychat.net"
    : "http://localhost:3001";
};
export const getApiBaseUrl = () => {
  return window.envApi.isProduction()
    ? "https://api.foxychat.net/api"
    : "http://localhost:3001/api";
};
