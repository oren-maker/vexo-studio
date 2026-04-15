/**
 * Global photorealism directive — enforced at every image/video prompt site.
 * The user's standing rule: every generation must look like a real live-action
 * production with real human actors. No cartoon, no anime, no CGI, no 3D render,
 * no illustration, no painterly look.
 *
 * Import and prepend/append to any prompt string before sending to fal /
 * Google VEO / Sora / Gemini image / nano-banana.
 */

export const PHOTOREAL_DIRECTIVE =
  "PHOTOREALISTIC LIVE-ACTION ONLY — real human actors with real skin pores, real eyes, natural hair, natural wardrobe, shot on a cinema camera with real physical lighting. STRICTLY NOT animated, NOT cartoon, NOT anime, NOT 3D render, NOT CGI, NOT illustration, NOT painted, NOT digital art, NOT stylized.";

export const PHOTOREAL_NEGATIVE =
  "cartoon, anime, animation, illustration, 3d render, cgi, painted, digital art, stylized, toy, plastic, uncanny, waxy skin";
