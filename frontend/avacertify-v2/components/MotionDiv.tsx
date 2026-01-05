"use client"

import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";

// Properly typed wrapper around framer-motion's motion.div
// This ensures all animation props are correctly typed
type MotionDivProps = HTMLMotionProps<"div">

export const MotionDiv = React.forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => {
  return <motion.div ref={ref} {...props} />;
});

MotionDiv.displayName = "MotionDiv";

export default MotionDiv;