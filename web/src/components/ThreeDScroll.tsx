import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface ThreeDScrollProps {
  recede: boolean;
}

export function ThreeDScroll({ recede }: ThreeDScrollProps) {
  const [beat, setBeat] = useState<number>(1);
  const [loopCount, setLoopCount] = useState<number>(0);

  // Orchestrate the timeline beats
  useEffect(() => {
    if (recede) return;

    let timer1: ReturnType<typeof setTimeout>;
    let timer2: ReturnType<typeof setTimeout>;
    let timer3: ReturnType<typeof setTimeout>;
    let timer4: ReturnType<typeof setTimeout>;
    let loopTimer: ReturnType<typeof setTimeout>;

    // Reset timeline
    setBeat(1);

    // Beat 1: 0 - 1.5s (Darkness pulse)
    // Beat 2: 1.5s - 4.0s (Materialisation)
    timer1 = setTimeout(() => {
      setBeat(2);
    }, 1500);

    // Beat 3: 4.0s - 12.0s (Slow Zoom/Drift)
    timer2 = setTimeout(() => {
      setBeat(3);
    }, 4000);

    // Beat 4: 12.0s - 15.0s (Cool Reveal)
    timer3 = setTimeout(() => {
      setBeat(4);
    }, 12000);

    // Beat 5: 15.0s - 19.0s (Rest Breathing)
    timer4 = setTimeout(() => {
      setBeat(5);
    }, 15000);

    // Loop trigger at 19.0s
    loopTimer = setTimeout(() => {
      if (loopCount < 1) {
        setLoopCount((prev) => prev + 1);
      }
    }, 19000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(loopTimer);
    };
  }, [loopCount, recede]);

  // Recede animation controls
  const containerVariants = {
    active: {
      scale: 1.0,
      opacity: 1,
      transition: { duration: 0.5 }
    },
    receding: {
      scale: 0.85,
      opacity: 0,
      z: -100,
      transition: { duration: 1.5, ease: [0.4, 0, 0.2, 1] }
    }
  };

  return (
    <motion.div
      className="absolute inset-0 z-0 w-full h-full pointer-events-none bg-black overflow-hidden"
      variants={containerVariants}
      animate={recede ? "receding" : "active"}
      style={{ perspective: 1000 }}
    >
      {/* Beat 1: Glowing warm light point */}
      {beat === 1 && (
        <motion.div
          className="absolute top-1/2 left-1/2 w-1 h-1 rounded-full bg-[#B8965A]"
          style={{
            x: "-50%",
            y: "-50%",
            boxShadow: "0 0 15px 4px #B8965A",
          }}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{
            scale: [0.5, 2.5, 0],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 1.5,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Necklace Image with dynamic reveals */}
      {beat >= 2 && (
        <motion.div
          className="absolute inset-0 w-full h-full"
          initial={{
            opacity: 0,
            clipPath: "inset(0% 0% 100% 0%)",
            scale: 1.0,
          }}
          animate={{
            opacity: beat >= 4 ? 0.95 : 0.8,
            clipPath: "inset(0% 0% 0% 0%)",
            scale: beat === 5 ? [1.04, 1.042, 1.04] : beat >= 3 ? 1.04 : 1.0,
          }}
          transition={{
            opacity: { duration: beat === 2 ? 2.5 : 1.0, ease: "easeOut" },
            clipPath: { duration: 2.5, ease: "easeInOut" },
            scale:
              beat === 5
                ? {
                    duration: 4,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut",
                  }
                : { duration: 8, ease: "easeOut" },
          }}
        >
          <img
            src="/assets/luxury_necklace.png"
            alt="High Jewellery Necklace"
            className="w-full h-full object-cover"
          />

          {/* Beat 4: Fading in the cool bottom-left fill light */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 10% 90%, rgba(210, 224, 255, 0.18), transparent 60%)",
              mixBlendMode: "screen",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: beat >= 4 ? 1 : 0 }}
            transition={{ duration: 3.0, ease: "easeInOut" }}
          />

          {/* Shifting warm background caustics simulation */}
          <motion.div
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(184, 150, 90, 0.12), transparent 70%)",
              mixBlendMode: "color-dodge",
            }}
            animate={{
              scale: [0.95, 1.05, 0.95],
              opacity: [0.25, 0.35, 0.25],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              repeatType: "reverse",
              ease: "easeInOut",
            }}
          />
        </motion.div>
      )}
    </motion.div>
  );
}
