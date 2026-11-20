import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SharePage } from "./components/SharePage";
import "./index.css";

function Root() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const match = path.match(/^\/p\/([^/]+)\/?$/);
  if (match) {
    let id = match[1];
    try {
      id = decodeURIComponent(id);
    } catch {
      // 保留原始片段，交由服务端判定非法 ID（400）。
    }
    return <SharePage id={id} />;
  }
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);