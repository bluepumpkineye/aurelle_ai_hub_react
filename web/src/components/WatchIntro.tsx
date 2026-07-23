import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface WatchIntroProps {
  recede: boolean;
}

// Cinematic brand playlist for the login panel. Clips play in sequence and
// loop. All three are H.264 1280x720 @24fps / ~8s, so transitions are seamless.
const CLIPS = [
  "/clips/Aurelle%20Watch.mp4",
  "/clips/Aurelle%20Brand.mp4",
  "/clips/Aurelle%20High%20Jewelry.mp4",
];

const CROSSFADE_MS = 700;

// Autoplays muted + looped so browsers permit playback, and recedes (scale +
// fade) once the user focuses a form field — mirroring the prior behaviour.
//
// Smoothness strategy: two <video> elements act as a double buffer. Only the
// active one is visible; the idle one silently preloads the *next* clip, so
// each clip change is an instant opacity crossfade with no buffering stall.
export function WatchIntro({ recede }: WatchIntroProps) {
  const slotA = useRef<HTMLVideoElement>(null);
  const slotB = useRef<HTMLVideoElement>(null);
  const [activeSlot, setActiveSlot] = useState(0);

  useEffect(() => {
    const a = slotA.current;
    const b = slotB.current;
    if (!a || !b) return;
    const slots = [a, b];

    // slotClip[i] = index into CLIPS currently loaded in slot i.
    const slotClip = [0, 1 % CLIPS.length];
    let active = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Prime both buffers up front (current clip + the one that follows it).
    a.src = CLIPS[slotClip[0]];
    b.src = CLIPS[slotClip[1]];
    a.load();
    b.load();
    a.play().catch(() => {});

    const onEnded = (endedSlot: number) => () => {
      if (endedSlot !== active) return; // ignore stray events from the idle buffer
      const cur = active;
      const other = 1 - cur;

      // Swap to the already-buffered next clip and crossfade.
      const nextVid = slots[other];
      nextVid.currentTime = 0;
      nextVid.play().catch(() => {});
      active = other;
      setActiveSlot(other);

      // After the crossfade completes, the outgoing slot is fully transparent,
      // so we can quietly repurpose it to preload the clip after the new one —
      // ready ~7s before it's ever shown.
      const t = setTimeout(() => {
        const following = (slotClip[other] + 1) % CLIPS.length;
        slotClip[cur] = following;
        slots[cur].src = CLIPS[following];
        slots[cur].load();
      }, CROSSFADE_MS);
      timers.push(t);
    };

    const hA = onEnded(0);
    const hB = onEnded(1);
    a.addEventListener("ended", hA);
    b.addEventListener("ended", hB);

    return () => {
      a.removeEventListener("ended", hA);
      b.removeEventListener("ended", hB);
      timers.forEach(clearTimeout);
    };
  }, []);

  const containerVariants = {
    active: {
      scale: 1.0,
      opacity: 1,
      transition: { duration: 0.5 },
    },
    receding: {
      scale: 0.85,
      opacity: 0,
      z: -100,
      transition: {
        duration: 1.5,
        ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
      },
    },
  };

  return (
    <motion.div
      className="absolute inset-0 z-0 w-full h-full pointer-events-none bg-black overflow-hidden"
      variants={containerVariants}
      animate={recede ? "receding" : "active"}
      style={{ perspective: 1000 }}
    >
      {[slotA, slotB].map((ref, i) => (
        <video
          key={i}
          ref={ref}
          className="absolute inset-0 w-full h-full object-cover transition-opacity ease-linear"
          style={{
            opacity: activeSlot === i ? 1 : 0,
            transitionDuration: `${CROSSFADE_MS}ms`,
            willChange: "opacity",
          }}
          muted
          playsInline
          preload="auto"
        />
      ))}
      {/* Subtle darkening so the AURELLE wordmark stays legible over the footage */}
      <div className="absolute inset-0 bg-black/25 pointer-events-none" />
    </motion.div>
  );
}
