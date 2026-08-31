import { Config } from "@remotion/cli/config";

Config.setOverwriteOutput(true);

// Compositions load Google Fonts and may reference assets served from the
// project's public directory; without this, Chromium blocks them silently and
// you get a frame with fallback type and no explanation.
Config.setChromiumDisableWebSecurity(true);

// Transparent stills for lower thirds need an alpha-capable image format.
Config.setVideoImageFormat("jpeg");
