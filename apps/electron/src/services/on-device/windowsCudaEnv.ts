/**
 * Extra PATH entries for Windows so CUDA/cuBLAS DLLs resolve when running
 * llama-server / whisper-server (zip may not include every runtime DLL).
 */

export function augmentPathWithCudaBins(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (process.platform !== "win32") return { ...env };
  const extra = [
    String.raw`C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\bin`,
    String.raw`C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.3\bin`,
    String.raw`C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.2\bin`,
    String.raw`C:\Program Files\NVIDIA Corporation\NVSMI`,
  ];
  const pathKey =
    Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "Path";
  const cur = env[pathKey] ?? "";
  const merged = [...extra, cur].filter(Boolean).join(";");
  return { ...env, [pathKey]: merged };
}
