"use client"

import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";

// Correctly extend the motion props for a 'div' element
type MotionDivProps = HTMLMotionProps<"div">;

export const MotionDiv = React.forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => {
  return <motion.div ref={ref} {...props} />;
});

MotionDiv.displayName = "MotionDiv";

export default MotionDiv;