import { test, expect, type Page } from "@playwright/test";

async function openReceipt(page: Page): Promise<void> {
  await page.goto("./");
  await page.getByRole("button", { name: "Explore a sample trip", exact: true }).click();
  await page.goto("./#/12");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
}

test("camera preview opens inline on touch devices and stops on close", async ({ page }) => {
  await openReceipt(page);
  // Stub the prototype so WebKit cannot discard an instance-only override.
  await page.evaluate(() => {
    // Use an immediately resolved real canvas stream to expose video-mount races.
    Object.defineProperty(MediaDevices.prototype, "getUserMedia", { value: async (constraints: MediaStreamConstraints) => {
      const canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 240;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "white"; context.fillRect(0, 0, 320, 240);
      const media = canvas.captureStream(5);
      Object.assign(window, { cameraTest: { media, constraints } });
      return media;
    } });
  });
  let filePickers = 0;
  page.on("filechooser", () => filePickers++);
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(page.getByLabel("Receipt camera preview")).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture receipt", exact: true })).toBeEnabled();
  expect(filePickers).toBe(0);
  expect(await page.evaluate(() => (window as any).cameraTest.constraints.video.facingMode.ideal)).toBe("environment");
  await page.screenshot({ path: test.info().outputPath("inline-camera.png") });
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  expect(await page.evaluate(() => (window as any).cameraTest.media.getTracks().every((track: MediaStreamTrack) => track.readyState === "ended"))).toBe(true);
  await expect(page.getByLabel("Receipt camera preview")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Take photo", exact: true })).toBeEnabled();
});

test("denied camera leaves upload and manual entry available", async ({ page }) => {
  await openReceipt(page);
  await page.evaluate(() => {
    Object.defineProperty(MediaDevices.prototype, "getUserMedia", { value: async () => { throw new DOMException("Denied", "NotAllowedError"); } });
  });
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Camera access was declined");
  await expect(page.getByRole("button", { name: "Upload receipt", exact: true })).toBeEnabled();
  await expect(page.getByLabel("What was it for?")).toBeEditable();
});

test("stalled camera recovers and stops media arriving after timeout", async ({ page }) => {
  await openReceipt(page);
  await page.evaluate(() => {
    Object.defineProperty(MediaDevices.prototype, "getUserMedia", { value: () => new Promise(resolve => {
      Object.assign(window, { finishCamera: () => {
        const media = document.createElement("canvas").captureStream(5);
        Object.assign(window, { lateCamera: media });
        resolve(media);
      } });
    }) });
  });
  await page.clock.install();
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(page.getByText("Opening camera…", { exact: true })).toBeVisible();
  await page.clock.fastForward(20_001);
  await expect(page.getByRole("alert")).toContainText("The camera did not start");
  await expect(page.getByRole("button", { name: "Take photo", exact: true })).toBeEnabled();
  await page.evaluate(() => (window as any).finishCamera());
  await expect.poll(() => page.evaluate(() => (window as any).lateCamera.getTracks().every((track: MediaStreamTrack) => track.readyState === "ended"))).toBe(true);
  await expect(page.getByLabel("Receipt camera preview")).toHaveCount(0);
});

test("camera becomes capturable when video data arrives after play resolves", async ({ page }) => {
  await openReceipt(page);
  await page.evaluate(() => {
    let frameAvailable=false;
    Object.defineProperty(HTMLVideoElement.prototype,"videoWidth",{configurable:true,get:()=>frameAvailable?320:0});
    Object.defineProperty(HTMLVideoElement.prototype,"videoHeight",{configurable:true,get:()=>frameAvailable?240:0});
    Object.defineProperty(HTMLVideoElement.prototype,"readyState",{configurable:true,get:()=>frameAvailable?HTMLMediaElement.HAVE_CURRENT_DATA:HTMLMediaElement.HAVE_NOTHING});
    Object.defineProperty(HTMLMediaElement.prototype,"play",{configurable:true,value:()=>Promise.resolve()});
    Object.defineProperty(MediaDevices.prototype,"getUserMedia",{configurable:true,value:async()=>{
      const media=document.createElement("canvas").captureStream(5);
      Object.assign(window,{delayedFrameMedia:media});return media;
    }});
    Object.assign(window,{deliverCameraFrame:()=>{
      frameAvailable=true;
      document.querySelector<HTMLVideoElement>('video[aria-label="Receipt camera preview"]')!.dispatchEvent(new Event("loadeddata"));
    }});
  });
  await page.getByRole("button",{name:"Take photo",exact:true}).click();
  const capture=page.getByRole("button",{name:"Capture receipt",exact:true});
  await expect(capture).toBeDisabled();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await page.evaluate(()=>(window as any).deliverCameraFrame());
  await expect(capture).toBeEnabled();
  await page.getByRole("button",{name:"Close camera",exact:true}).click();
  expect(await page.evaluate(()=>(window as any).delayedFrameMedia.getTracks().every((track:MediaStreamTrack)=>track.readyState==="ended"))).toBe(true);
});


test("resolved playback without a usable frame still times out and stops its stream",async({page})=>{
  await openReceipt(page);
  await page.evaluate(()=>{
    Object.defineProperty(HTMLVideoElement.prototype,"videoWidth",{configurable:true,get:()=>0});
    Object.defineProperty(HTMLVideoElement.prototype,"videoHeight",{configurable:true,get:()=>0});
    Object.defineProperty(HTMLMediaElement.prototype,"play",{configurable:true,value:()=>Promise.resolve()});
    Object.defineProperty(MediaDevices.prototype,"getUserMedia",{configurable:true,value:async()=>{
      const media=document.createElement("canvas").captureStream(5);
      Object.assign(window,{emptyFrameMedia:media});return media;
    }});
  });
  await page.clock.install();
  await page.getByRole("button",{name:"Take photo",exact:true}).click();
  await expect(page.getByText("Opening camera…",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Capture receipt",exact:true})).toBeDisabled();
  await page.clock.fastForward(20_001);
  await expect(page.getByRole("alert")).toContainText("The camera did not start");
  expect(await page.evaluate(()=>(window as any).emptyFrameMedia.getTracks().every((track:MediaStreamTrack)=>track.readyState==="ended"))).toBe(true);
  await expect(page.getByLabel("Receipt camera preview")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Take photo",exact:true})).toBeEnabled();
});
