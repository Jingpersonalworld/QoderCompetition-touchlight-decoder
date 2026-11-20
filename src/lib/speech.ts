import { useEffect, useRef, useState } from "react";

export interface SpeechItem {
  text: string;
}

/** 原生 speechSynthesis 顺序朗读，供 04 工作台与 /p/:id 分享页复用。 */
export function useSpeechReader() {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  const [index, setIndex] = useState<number | null>(null);
  const [subtitle, setSubtitle] = useState("");
  const stopped = useRef(false);

  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  function stop() {
    stopped.current = true;
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
    setIndex(null);
    setSubtitle("");
  }

  function start(script: SpeechItem[]) {
    if (!supported) return;
    window.speechSynthesis.cancel();
    stopped.current = false;
    let i = 0;
    const next = () => {
      if (stopped.current) return;
      if (i >= script.length) {
        setSpeaking(false);
        setIndex(null);
        setSubtitle("");
        return;
      }
      const item = script[i];
      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.lang = "zh-CN";
      utterance.onstart = () => {
        if (stopped.current) return;
        setIndex(i);
        setSubtitle(item.text);
      };
      const advance = () => {
        if (stopped.current) return;
        i += 1;
        next();
      };
      utterance.onend = advance;
      utterance.onerror = advance;
      window.speechSynthesis.speak(utterance);
    };
    setSpeaking(true);
    next();
  }

  function toggle(script: SpeechItem[]) {
    if (speaking) stop();
    else start(script);
  }

  return { supported, speaking, index, subtitle, start, stop, toggle };
}