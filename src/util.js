"use strict";

/**
 * @function checkXRSupport
 * @description Checks if WebXR is supported and an immersive AR session can be started.
 * @returns {Promise<boolean>} A promise which resolves to true if WebXR is supported and an immersive AR session can be started, false otherwise.
 */
export async function checkXRSupport() {
  if ("xr" in navigator) {
    return await navigator.xr.isSessionSupported("immersive-ar");
  }
  return false;
}
