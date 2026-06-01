export const springSnappy = {
  type: "spring" as const,
  stiffness: 340,
  damping: 30,
  mass: 0.8,
};

export const fadeSlide = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
  transition: { duration: 0.2 },
};
