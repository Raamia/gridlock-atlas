import { Config } from "@remotion/cli/config";

// Headless shell that ships with Playwright; set REMOTION_BROWSER to override.
Config.setBrowserExecutable(process.env.REMOTION_BROWSER ?? "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setCodec("h264");
Config.setCrf(20);
Config.setX264Preset("slow");
Config.setPixelFormat("yuv420p");
Config.setChromiumOpenGlRenderer("swiftshader"); // ~5x faster than swangle here, identical frames
