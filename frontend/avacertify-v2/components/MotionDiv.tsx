"use client"

import React from "react";
import { motion } from "framer-motion";

// Use ComponentPropsWithoutRef to ensure all motion and HTML props are inherited
type MotionDivProps = React.ComponentPropsWithoutRef<typeof motion.div>;

export const MotionDiv = React.forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => {
  return <motion.div ref={ref} {...props} />;
});

MotionDiv.displayName = "MotionDiv";

export default MotionDiv;