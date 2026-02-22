import test from "ava";
import HueApi from "../src/lib/hue-api/api.js";

test("setAuthKey correctly handles empty authKey", (t) => {
  const api = new HueApi("http://localhost");

  // Set an auth key first
  api.setAuthKey("test-key");
  // HACK: access private axiosInstance through casting for testing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const axiosInstance = (api as any).axiosInstance;
  t.is(axiosInstance.defaults.headers.common["hue-application-key"], "test-key");

  // Set it to empty to remove it
  api.setAuthKey("");
  t.is(axiosInstance.defaults.headers.common["hue-application-key"], undefined);

  // Set it to empty again when it doesn't exist
  t.notThrows(() => api.setAuthKey(""));
  t.is(axiosInstance.defaults.headers.common["hue-application-key"], undefined);
});
