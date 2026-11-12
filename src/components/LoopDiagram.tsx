import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

/** Placeholders until a theme file exists. */
const LOOP_FILL = '#E1F5EE';
const LOOP_STROKE = '#0F6E56';
const LOOP_LABEL = '#085041';
const CONNECT_FILL = '#FAECE7';
const CONNECT_STROKE = '#993C1D';
const CONNECT_LABEL = '#712B13';
const ARROW = '#1D9E75';
const SPOKE = '#D85A30';

const DIM = 0.2;
const FADE_MS = 300;
const ARC_RADIUS = 90;
const CHEVRON_LENGTH = 9;
const CHEVRON_WING = 4;

export type LoopHighlight = 'all' | 'plan' | 'do' | 'reflect' | 'connect';

type Props = {
  highlight: LoopHighlight;
};

type Part = 'plan' | 'do' | 'reflect' | 'connect' | 'spokes' | 'arrows';

const AnimatedG = Animated.createAnimatedComponent(G);

const ARCS = [
  { d: 'M180 54 A90 90 0 0 1 230 141', x1: 180, y1: 54, x2: 230, y2: 141 },
  { d: 'M190 210 A90 90 0 0 1 90 210', x1: 190, y1: 210, x2: 90, y2: 210 },
  { d: 'M50 141 A90 90 0 0 1 101 54', x1: 50, y1: 141, x2: 101, y2: 54 },
] as const;

function arcCenter(x1: number, y1: number, x2: number, y2: number, radius: number) {
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const radiusSq = radius * radius;
  const denom = radiusSq * dy * dy + radiusSq * dx * dx;
  const numer = radiusSq * radiusSq - radiusSq * dy * dy - radiusSq * dx * dx;
  const root = Math.sqrt(Math.max(0, numer / denom));
  // large-arc is 0 and sweep is 1, so the center sits on the positive side.
  return {
    x: root * dy + (x1 + x2) / 2,
    y: root * -dx + (y1 + y2) / 2,
  };
}

function chevronPath(x: number, y: number, cx: number, cy: number): string {
  const len = Math.hypot(x - cx, y - cy) || 1;
  const dx = -(y - cy) / len;
  const dy = (x - cx) / len;
  const bx = x - dx * CHEVRON_LENGTH;
  const by = y - dy * CHEVRON_LENGTH;
  const px = -dy;
  const py = dx;
  const n = (value: number) => value.toFixed(2);
  return `M ${n(bx + px * CHEVRON_WING)} ${n(by + py * CHEVRON_WING)} L ${n(x)} ${n(y)} L ${n(bx - px * CHEVRON_WING)} ${n(by - py * CHEVRON_WING)}`;
}

const ARROWS = ARCS.map((arc) => {
  const center = arcCenter(arc.x1, arc.y1, arc.x2, arc.y2, ARC_RADIUS);
  return { d: arc.d, chevron: chevronPath(arc.x2, arc.y2, center.x, center.y) };
});

function partOpacity(highlight: LoopHighlight, part: Part): number {
  if (highlight === 'all') {
    return 1;
  }
  if (part === 'arrows') {
    return DIM;
  }
  if (part === 'spokes') {
    return highlight === 'connect' ? 1 : DIM;
  }
  return highlight === part ? 1 : DIM;
}

function useGroupOpacity(highlight: LoopHighlight, part: Part) {
  const opacity = useRef(new Animated.Value(partOpacity(highlight, part))).current;
  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: partOpacity(highlight, part),
      duration: FADE_MS,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [highlight, opacity, part]);
  return opacity as unknown as number;
}

function NodeLabel({ x, y, color, children }: { x: number; y: number; color: string; children: string }) {
  return (
    <SvgText
      x={x}
      y={y}
      fill={color}
      fontSize={14}
      fontWeight="500"
      textAnchor="middle"
      alignmentBaseline="central"
    >
      {children}
    </SvgText>
  );
}

export function LoopDiagram({ highlight }: Props) {
  const planOpacity = useGroupOpacity(highlight, 'plan');
  const doOpacity = useGroupOpacity(highlight, 'do');
  const reflectOpacity = useGroupOpacity(highlight, 'reflect');
  const connectOpacity = useGroupOpacity(highlight, 'connect');
  const spokeOpacity = useGroupOpacity(highlight, 'spokes');
  const arrowOpacity = useGroupOpacity(highlight, 'arrows');

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={280} height={235} viewBox="0 0 280 235">
        <AnimatedG opacity={arrowOpacity}>
          {ARROWS.map((arrow) => (
            <Path
              key={arrow.d}
              d={arrow.d}
              stroke={ARROW}
              strokeWidth={1.5}
              fill="none"
            />
          ))}
          {ARROWS.map((arrow) => (
            <Path
              key={`${arrow.d}-chevron`}
              d={arrow.chevron}
              stroke={ARROW}
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="miter"
            />
          ))}
        </AnimatedG>
        <AnimatedG opacity={spokeOpacity}>
          <Line x1={140} y1={103} x2={140} y2={79} stroke={SPOKE} strokeWidth={1} strokeDasharray="3 3" />
          <Line x1={168} y1={151} x2={188} y2={163} stroke={SPOKE} strokeWidth={1} strokeDasharray="3 3" />
          <Line x1={112} y1={151} x2={92} y2={163} stroke={SPOKE} strokeWidth={1} strokeDasharray="3 3" />
        </AnimatedG>
        <AnimatedG opacity={planOpacity}>
          <Circle cx={140} cy={45} r={34} fill={LOOP_FILL} stroke={LOOP_STROKE} strokeWidth={0.5} />
          <NodeLabel x={140} y={45} color={LOOP_LABEL}>
            Plan
          </NodeLabel>
        </AnimatedG>
        <AnimatedG opacity={doOpacity}>
          <Circle cx={218} cy={180} r={34} fill={LOOP_FILL} stroke={LOOP_STROKE} strokeWidth={0.5} />
          <NodeLabel x={218} y={180} color={LOOP_LABEL}>
            Do
          </NodeLabel>
        </AnimatedG>
        <AnimatedG opacity={reflectOpacity}>
          <Circle cx={62} cy={180} r={34} fill={LOOP_FILL} stroke={LOOP_STROKE} strokeWidth={0.5} />
          <NodeLabel x={62} y={180} color={LOOP_LABEL}>
            Reflect
          </NodeLabel>
        </AnimatedG>
        <AnimatedG opacity={connectOpacity}>
          <Circle cx={140} cy={135} r={32} fill={CONNECT_FILL} stroke={CONNECT_STROKE} strokeWidth={0.5} />
          <NodeLabel x={140} y={135} color={CONNECT_LABEL}>
            Connect
          </NodeLabel>
        </AnimatedG>
      </Svg>
    </View>
  );
}
