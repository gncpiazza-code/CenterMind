"use client";

import { motion } from "framer-motion";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.02 },
  },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] },
  },
};

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Si false, no anima (p. ej. datos cacheados instantáneos). */
  animate?: boolean;
};

export function SupervisionReveal({ children, className = "", animate = true }: Props) {
  if (!animate) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SupervisionRevealItem({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}
