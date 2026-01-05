"use client"

import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";

// Small typed wrapper around framer-motion's motion.div to avoid unsafe casts
// Accepts all HTMLMotionProps<'div'> including animation props like initial/animate
export const MotionDiv = React.forwardRef<HTMLDivElement, HTMLMotionProps<"div">>((props, ref) => {
  return <motion.div ref={ref} {...props} />;
});

MotionDiv.displayName = "MotionDiv";

export default MotionDiv;
