import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  LayoutChangeEvent,
} from "react-native";
import Svg, {
  Defs,
  Rect,
  G,
  Path,
  Ellipse,
  Polygon,
  Circle,
  LinearGradient,
  RadialGradient,
  Stop,
  Polyline,
} from "react-native-svg";
import { useAudioPlayer } from "expo-audio";

// --- Types ---
type RectType = { x: number; y: number; width: number; height: number };
type ObstacleType = "TREE" | "ROCK" | "SNOWMAN";
type Obstacle = RectType & { id: number; passed: boolean; type: ObstacleType };
type Difficulty = "EASY" | "NORMAL" | "HARD";
type TrailPoint = { x: number; y: number; id: number };

// --- Constants & Settings ---
const PLAYER_WIDTH = 28;
const PLAYER_HEIGHT = 38; // Slightly taller for realistic skis
const OBSTACLE_WIDTH = 40;
const OBSTACLE_HEIGHT = 50;

const DIFFICULTY_SETTINGS = {
  EASY: { initialSpeed: 4.0, speedIncrement: 0.2, spawnRateBase: 0.015 },
  NORMAL: { initialSpeed: 5.5, speedIncrement: 0.4, spawnRateBase: 0.035 },
  HARD: { initialSpeed: 7.5, speedIncrement: 0.7, spawnRateBase: 0.06 },
};

const windowWidth = Dimensions.get("window").width;
const windowHeight = Dimensions.get("window").height;

// --- Main Game Component ---
export default function App() {
  const [gameState, setGameState] = useState<"START" | "PLAYING" | "GAME_OVER">(
    "START",
  );
  const [score, setScore] = useState(0);

  const [dimensions, setDimensions] = useState({
    width: windowWidth,
    height: windowHeight - 100, // Account for bottom controls
  });
  const dimRef = useRef(dimensions);

  // --- Audio Setup using expo-audio ---
  const crashPlayer = useAudioPlayer(require("./assets/sounds/crash.wav"));
  const scorePlayer = useAudioPlayer(require("./assets/sounds/score.wav"));

  const playScore = () => {
    if (scorePlayer) {
      scorePlayer.seekTo(0);
      scorePlayer.play();
    }
  };

  const playCrash = () => {
    if (crashPlayer) {
      crashPlayer.seekTo(0);
      crashPlayer.play();
    }
  };

  const playerRef = useRef<RectType>({
    x: windowWidth / 2 - PLAYER_WIDTH / 2,
    y: 120,
    width: PLAYER_WIDTH - 8,
    height: PLAYER_HEIGHT - 8,
  });

  const difficultyRef = useRef<Difficulty>("NORMAL");
  const velocityRef = useRef(0);
  const tiltRef = useRef(0);
  const bobRef = useRef(0);

  const obstaclesRef = useRef<Obstacle[]>([]);
  const trailRef = useRef<TrailPoint[]>([]);
  const trailIdCounter = useRef(0);
  const speedRef = useRef(DIFFICULTY_SETTINGS.NORMAL.initialSpeed);
  const animationRef = useRef<number>(0);
  const obstacleIdCounter = useRef(0);

  const [, setTick] = useState(0);

  const [leftActive, setLeftActive] = useState(false);
  const [rightActive, setRightActive] = useState(false);

  // Sync refs to state for resizing
  useEffect(() => {
    dimRef.current = dimensions;
  }, [dimensions]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setDimensions({ width, height });
  };

  const spawnObstacle = useCallback(() => {
    const x = Math.random() * (dimRef.current.width - OBSTACLE_WIDTH);
    const types: ObstacleType[] = ["TREE", "ROCK", "SNOWMAN"];
    const type = types[Math.floor(Math.random() * types.length)];

    let width = OBSTACLE_WIDTH;
    let height = OBSTACLE_HEIGHT;

    if (type === "ROCK") {
      width = 35;
      height = 25;
    } else if (type === "SNOWMAN") {
      width = 30;
      height = 45;
    } else if (type === "TREE") {
      width = 45;
      height = 60;
    }

    // Shrink hitbox slightly for fairer gameplay
    obstaclesRef.current.push({
      id: obstacleIdCounter.current++,
      x,
      y: dimRef.current.height + Math.max(OBSTACLE_HEIGHT, height) + 50,
      width: width - 10,
      height: height - 10,
      passed: false,
      type,
    });
  }, []);

  const checkCollision = (rect1: RectType, rect2: RectType) => {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  };

  const startGame = (diff: Difficulty) => {
    difficultyRef.current = diff;
    setGameState("PLAYING");
    setScore(0);
    playerRef.current = {
      x: dimRef.current.width / 2 - PLAYER_WIDTH / 2,
      y: 120,
      width: PLAYER_WIDTH - 8,
      height: PLAYER_HEIGHT - 8,
    };
    velocityRef.current = 0;
    tiltRef.current = 0;
    bobRef.current = 0;
    obstaclesRef.current = [];
    trailRef.current = [];
    speedRef.current = DIFFICULTY_SETTINGS[diff].initialSpeed;
    obstacleIdCounter.current = 0;
    setLeftActive(false);
    setRightActive(false);
  };

  const gameLoop = useCallback(() => {
    if (gameState !== "PLAYING") return;

    const settings = DIFFICULTY_SETTINGS[difficultyRef.current];

    if (leftActive) velocityRef.current -= 0.85;
    if (rightActive) velocityRef.current += 0.85;

    velocityRef.current *= 0.88;
    playerRef.current.x += velocityRef.current;

    if (playerRef.current.x <= 0) {
      playerRef.current.x = 0;
      velocityRef.current = Math.abs(velocityRef.current) * 0.5;
    } else if (
      playerRef.current.x >=
      dimRef.current.width - playerRef.current.width
    ) {
      playerRef.current.x = dimRef.current.width - playerRef.current.width;
      velocityRef.current = -Math.abs(velocityRef.current) * 0.5;
    }

    const targetTilt = velocityRef.current * 4.5;
    tiltRef.current += (targetTilt - tiltRef.current) * 0.2;
    bobRef.current =
      Math.sin(Date.now() * 0.015) * (1 + speedRef.current * 0.2);

    if (Math.abs(velocityRef.current) > 0.5 || Date.now() % 3 === 0) {
      trailRef.current.push({
        x: playerRef.current.x + PLAYER_WIDTH / 2,
        y: playerRef.current.y + PLAYER_HEIGHT - 10,
        id: trailIdCounter.current++,
      });
    }

    trailRef.current.forEach((pt) => {
      pt.y -= speedRef.current;
    });
    trailRef.current = trailRef.current.filter((pt) => pt.y > -50);

    let currentScore = score;
    let crashed = false;

    for (let i = obstaclesRef.current.length - 1; i >= 0; i--) {
      const obs = obstaclesRef.current[i];
      obs.y -= speedRef.current;

      if (checkCollision(playerRef.current, obs)) {
        crashed = true;
        break;
      }

      if (!obs.passed && obs.y < playerRef.current.y) {
        obs.passed = true;
        currentScore += 1;
        playScore();
        if (currentScore % 5 === 0) speedRef.current += settings.speedIncrement;
      }

      if (obs.y + obs.height < -50) {
        obstaclesRef.current.splice(i, 1);
      }
    }

    if (crashed) {
      playCrash();
      setGameState("GAME_OVER");
      return;
    }

    const spawnMultiplier = dimRef.current.width / 400;
    if (
      Math.random() <
      (settings.spawnRateBase + speedRef.current * 0.002) * spawnMultiplier
    ) {
      spawnObstacle();
    }

    if (currentScore !== score) setScore(currentScore);

    setTick((t) => t + 1);
    animationRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, score, leftActive, rightActive, spawnObstacle]);

  useEffect(() => {
    if (gameState === "PLAYING") {
      animationRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [gameState, gameLoop]);

  const snowSprayScale = Math.min(
    1,
    Math.max(0, (Math.abs(tiltRef.current) - 10) / 20),
  );
  const isLeaningLeft = tiltRef.current < 0;

  return (
    <View style={styles.appContainer}>
      <View style={styles.gameArea} onLayout={handleLayout}>
        <Svg width={dimensions.width} height={dimensions.height}>
          <Defs>
            {/* Realism: Dynamic Snow Ground */}
            <LinearGradient id="snowGround" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#e0f2fe" />
              <Stop offset="20%" stopColor="#f8fafc" />
              <Stop offset="100%" stopColor="#ffffff" />
            </LinearGradient>

            {/* Realism: Tree Textures */}
            <LinearGradient id="trunkGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#291304" />
              <Stop offset="40%" stopColor="#5c3012" />
              <Stop offset="80%" stopColor="#3d1d07" />
              <Stop offset="100%" stopColor="#1a0b02" />
            </LinearGradient>
            <LinearGradient id="pineBottom" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#0f5132" />
              <Stop offset="100%" stopColor="#042415" />
            </LinearGradient>
            <LinearGradient id="pineMid" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#146c43" />
              <Stop offset="100%" stopColor="#0a3622" />
            </LinearGradient>
            <LinearGradient id="pineTop" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#198754" />
              <Stop offset="100%" stopColor="#0f5132" />
            </LinearGradient>

            {/* Realism: Rock Shading */}
            <LinearGradient id="rockHighlight" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#cbd5e1" />
              <Stop offset="100%" stopColor="#64748b" />
            </LinearGradient>
            <LinearGradient id="rockShadow" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#475569" />
              <Stop offset="100%" stopColor="#1e293b" />
            </LinearGradient>

            {/* Realism: Snowman & Snow Elements */}
            <RadialGradient id="snowSphere" cx="35%" cy="30%" r="65%">
              <Stop offset="0%" stopColor="#ffffff" />
              <Stop offset="60%" stopColor="#e2e8f0" />
              <Stop offset="90%" stopColor="#94a3b8" />
              <Stop offset="100%" stopColor="#64748b" />
            </RadialGradient>
            <LinearGradient id="carrotGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#f97316" />
              <Stop offset="100%" stopColor="#c2410c" />
            </LinearGradient>
            <LinearGradient id="scarfGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#ef4444" />
              <Stop offset="100%" stopColor="#7f1d1d" />
            </LinearGradient>

            {/* Realism: Skier Assets */}
            <LinearGradient id="suitGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#dc2626" />
              <Stop offset="50%" stopColor="#991b1b" />
              <Stop offset="100%" stopColor="#450a0a" />
            </LinearGradient>
            <LinearGradient id="skiGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#1e293b" />
              <Stop offset="50%" stopColor="#334155" />
              <Stop offset="100%" stopColor="#0f172a" />
            </LinearGradient>
            <LinearGradient id="goggleGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#38bdf8" />
              <Stop offset="50%" stopColor="#0284c7" />
              <Stop offset="100%" stopColor="#082f49" />
            </LinearGradient>
          </Defs>

          {/* Ground */}
          <Rect
            x="0"
            y="0"
            width={dimensions.width}
            height={dimensions.height}
            fill="url(#snowGround)"
          />

          {/* Ski Trail (More realistic double tracks) */}
          {trailRef.current.length > 1 && (
            <>
              {/* Deep Track Shadows */}
              <Polyline
                points={trailRef.current
                  .map((p) => `${p.x - 6},${p.y}`)
                  .join(" ")}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.6}
              />
              <Polyline
                points={trailRef.current
                  .map((p) => `${p.x + 6},${p.y}`)
                  .join(" ")}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.6}
              />
              {/* Track Highlights */}
              <Polyline
                points={trailRef.current
                  .map((p) => `${p.x - 4},${p.y}`)
                  .join(" ")}
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
                opacity={0.8}
              />
              <Polyline
                points={trailRef.current
                  .map((p) => `${p.x + 4},${p.y}`)
                  .join(" ")}
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
                opacity={0.8}
              />
            </>
          )}

          {/* Obstacles */}
          {obstaclesRef.current.map((obs) => {
            const isTree = obs.type === "TREE";
            const isRock = obs.type === "ROCK";
            const isSnowman = obs.type === "SNOWMAN";

            // Centralize rendering coordinates slightly relative to box
            const cx = obs.width / 2;
            const by = obs.height;

            return (
              <G key={obs.id} x={obs.x} y={obs.y}>
                {/* Global Ambient Shadow for all objects */}
                <Ellipse
                  cx={cx}
                  cy={by - (isTree ? 4 : 2)}
                  rx={isTree ? 22 : isRock ? 18 : 16}
                  ry={isTree ? 9 : isRock ? 7 : 6}
                  fill="rgba(15, 23, 42, 0.35)"
                />

                {isTree && (
                  <>
                    {/* Detailed Trunk */}
                    <Rect
                      x={cx - 5}
                      y={by - 15}
                      width="10"
                      height="15"
                      fill="url(#trunkGrad)"
                      rx="2"
                    />
                    <Path
                      d={`M ${cx - 3},${by - 15} L ${cx - 3},${by} M ${cx},${by - 15} L ${cx},${by}`}
                      stroke="#1a0b02"
                      strokeWidth="1"
                      opacity={0.4}
                    />

                    {/* Layer 1: Bottom Pine */}
                    <Path
                      d={`M ${cx - 22},${by - 10} L ${cx},${by - 35} L ${cx + 22},${by - 10} Z`}
                      fill="url(#pineBottom)"
                    />
                    <Path
                      d={`M ${cx - 18},${by - 12} L ${cx},${by - 32} L ${cx + 18},${by - 12} Z`}
                      fill="#042415"
                      opacity={0.3}
                    />

                    {/* Layer 2: Mid Pine */}
                    <Path
                      d={`M ${cx - 18},${by - 25} L ${cx},${by - 45} L ${cx + 18},${by - 25} Z`}
                      fill="url(#pineMid)"
                    />
                    <Path
                      d={`M ${cx - 14},${by - 27} L ${cx},${by - 43} L ${cx + 14},${by - 27} Z`}
                      fill="#0a3622"
                      opacity={0.3}
                    />

                    {/* Layer 3: Top Pine */}
                    <Path
                      d={`M ${cx - 14},${by - 40} L ${cx},${by - 58} L ${cx + 14},${by - 40} Z`}
                      fill="url(#pineTop)"
                    />

                    {/* Snow Caps on Tree */}
                    <Path
                      d={`M ${cx - 8},${by - 45} L ${cx},${by - 58} L ${cx + 8},${by - 45} Q ${cx},${by - 40} ${cx - 8},${by - 45}`}
                      fill="#ffffff"
                      opacity={0.9}
                    />
                    <Path
                      d={`M ${cx - 12},${by - 28} L ${cx},${by - 42} L ${cx + 12},${by - 28} Q ${cx},${by - 23} ${cx - 12},${by - 28}`}
                      fill="#ffffff"
                      opacity={0.8}
                    />
                  </>
                )}

                {isRock && (
                  <>
                    {/* Multi-faceted Rock Base */}
                    <Path
                      d={`M 2,${by - 4} L 12,${by - 20} L ${cx + 10},${by - 24} L ${obs.width - 2},${by - 2} Z`}
                      fill="url(#rockShadow)"
                    />
                    <Path
                      d={`M 2,${by - 4} L 12,${by - 20} L ${cx + 4},${by - 8} L 8,${by} Z`}
                      fill="url(#rockHighlight)"
                    />
                    <Path
                      d={`M 12,${by - 20} L ${cx + 10},${by - 24} L ${cx + 14},${by - 10} L ${cx + 4},${by - 8} Z`}
                      fill="#94a3b8"
                    />
                    <Path
                      d={`M ${cx + 4},${by - 8} L ${cx + 14},${by - 10} L ${obs.width - 2},${by - 2} L 18,${by} Z`}
                      fill="#475569"
                    />

                    {/* Snow Accumulation on Rock */}
                    <Path
                      d={`M 10,${by - 18} L ${cx + 8},${by - 22} L ${cx + 16},${by - 12} Q ${cx + 6},${by - 10} 10,${by - 18}`}
                      fill="#ffffff"
                    />
                  </>
                )}

                {isSnowman && (
                  <>
                    {/* Stick Arms */}
                    <Path
                      d={`M ${cx - 8},${by - 25} L ${cx - 20},${by - 35} M ${cx - 18},${by - 33} L ${cx - 22},${by - 30}`}
                      stroke="url(#trunkGrad)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <Path
                      d={`M ${cx + 8},${by - 25} L ${cx + 20},${by - 30} M ${cx + 16},${by - 28} L ${cx + 22},${by - 25}`}
                      stroke="url(#trunkGrad)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />

                    {/* Snow Spheres */}
                    <Circle
                      cx={cx}
                      cy={by - 12}
                      r="14"
                      fill="url(#snowSphere)"
                    />
                    <Circle
                      cx={cx}
                      cy={by - 28}
                      r="11"
                      fill="url(#snowSphere)"
                    />
                    <Circle
                      cx={cx}
                      cy={by - 42}
                      r="8.5"
                      fill="url(#snowSphere)"
                    />

                    {/* Face Details */}
                    <Circle cx={cx - 3} cy={by - 44} r="1.5" fill="#1e293b" />
                    <Circle cx={cx + 3} cy={by - 44} r="1.5" fill="#1e293b" />
                    <Polygon
                      points={`${cx},${by - 42} ${cx + 8},${by - 40} ${cx},${by - 39}`}
                      fill="url(#carrotGrad)"
                    />

                    {/* Scarf */}
                    <Path
                      d={`M ${cx - 8},${by - 34} Q ${cx},${by - 30} ${cx + 8},${by - 34} L ${cx + 6},${by - 31} Q ${cx},${by - 27} ${cx - 6},${by - 31} Z`}
                      fill="url(#scarfGrad)"
                    />
                    <Path
                      d={`M ${cx + 4},${by - 31} L ${cx + 6},${by - 18} L ${cx + 10},${by - 18} L ${cx + 8},${by - 32} Z`}
                      fill="url(#scarfGrad)"
                    />

                    {/* Top Hat */}
                    <Rect
                      x={cx - 9}
                      y={by - 49}
                      width="18"
                      height="2"
                      fill="#1e293b"
                    />
                    <Rect
                      x={cx - 6}
                      y={by - 58}
                      width="12"
                      height="9"
                      fill="#334155"
                    />
                    <Rect
                      x={cx - 6}
                      y={by - 52}
                      width="12"
                      height="3"
                      fill="#dc2626"
                    />
                  </>
                )}
              </G>
            );
          })}

          {/* Player (Realistic Skier) */}
          <G
            x={playerRef.current.x}
            y={playerRef.current.y + bobRef.current}
            rotation={tiltRef.current}
            origin={`${PLAYER_WIDTH / 2}, ${PLAYER_HEIGHT / 2}`}
          >
            {/* Player Shadow */}
            <Ellipse
              cx={PLAYER_WIDTH / 2 - tiltRef.current * 0.4}
              cy={PLAYER_HEIGHT + 2 - bobRef.current}
              rx="18"
              ry="6"
              fill="rgba(15, 23, 42, 0.4)"
            />

            {/* Skis */}
            <Rect
              x="-2"
              y="10"
              width="6"
              height="32"
              rx="3"
              fill="url(#skiGrad)"
            />
            <Rect
              x={PLAYER_WIDTH - 4}
              y="10"
              width="6"
              height="32"
              rx="3"
              fill="url(#skiGrad)"
            />

            {/* Ski Poles (Angled out) */}
            <Path
              d={`M -6,20 L -12,38`}
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <Circle cx="-12" cy="36" r="2" fill="#475569" />
            <Path
              d={`M ${PLAYER_WIDTH + 6},20 L ${PLAYER_WIDTH + 12},38`}
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <Circle cx={PLAYER_WIDTH + 12} cy="36" r="2" fill="#475569" />

            {/* Snow Spray (Particle effect when turning) */}
            {snowSprayScale > 0 && (
              <G
                opacity={0.9 * snowSprayScale}
                scale={0.7 + snowSprayScale * 0.4}
                y={8}
              >
                <Circle
                  cx={isLeaningLeft ? PLAYER_WIDTH + 10 : -10}
                  cy="28"
                  r="5"
                  fill="#ffffff"
                  opacity="0.8"
                />
                <Circle
                  cx={isLeaningLeft ? PLAYER_WIDTH + 16 : -16}
                  cy="24"
                  r="7"
                  fill="#e2e8f0"
                  opacity="0.9"
                />
                <Circle
                  cx={isLeaningLeft ? PLAYER_WIDTH + 6 : -6}
                  cy="32"
                  r="4"
                  fill="#ffffff"
                />
              </G>
            )}

            {/* Skier Body */}
            <Rect
              x="4"
              y="12"
              width={PLAYER_WIDTH - 8}
              height={PLAYER_HEIGHT - 18}
              rx="6"
              fill="url(#suitGrad)"
            />
            {/* Arm highlights */}
            <Path
              d={`M 6,14 L 6,24`}
              stroke="#ef4444"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <Path
              d={`M ${PLAYER_WIDTH - 6},14 L ${PLAYER_WIDTH - 6},24`}
              stroke="#ef4444"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Skier Head (Helmet & Goggles) */}
            <Circle cx={PLAYER_WIDTH / 2} cy="10" r="9" fill="#1e293b" />
            <Path
              d={`M ${PLAYER_WIDTH / 2 - 7},10 Q ${PLAYER_WIDTH / 2},14 ${PLAYER_WIDTH / 2 + 7},10 L ${PLAYER_WIDTH / 2 + 7},6 Q ${PLAYER_WIDTH / 2},10 ${PLAYER_WIDTH / 2 - 7},6 Z`}
              fill="url(#goggleGrad)"
            />
            {/* Helmet Highlight */}
            <Path
              d={`M ${PLAYER_WIDTH / 2 - 5},4 Q ${PLAYER_WIDTH / 2},2 ${PLAYER_WIDTH / 2 + 5},4`}
              stroke="#475569"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </G>
        </Svg>

        {/* Start Screen */}
        {gameState === "START" && (
          <View style={styles.overlay}>
            <View style={styles.glassPanel}>
              <Text style={styles.title}>Softy Skier</Text>
              <Text style={styles.subtitle}>Pick Your Pace!</Text>
              <Pressable
                style={[styles.btn, styles.btnEasy]}
                onPress={() => startGame("EASY")}
              >
                <Text style={styles.btnText}>Easy</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnNormal]}
                onPress={() => startGame("NORMAL")}
              >
                <Text style={styles.btnText}>Normal</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnHard]}
                onPress={() => startGame("HARD")}
              >
                <Text style={styles.btnText}>Hard</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Game Over Screen */}
        {gameState === "GAME_OVER" && (
          <View style={[styles.overlay, styles.overlayDanger]}>
            <View style={styles.glassPanel}>
              <Text style={[styles.title, styles.textDanger]}>WIPEOUT!</Text>
              <Text style={styles.subtitle}>
                Ouch! That looked like it hurt.
              </Text>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreLabel}>Final Score</Text>
                <Text style={styles.scoreValue}>{score}</Text>
              </View>
              <Pressable
                style={[styles.btn, styles.btnNormal]}
                onPress={() => startGame(difficultyRef.current)}
              >
                <Text style={styles.btnText}>Try Again</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnDanger]}
                onPress={() => setGameState("START")}
              >
                <Text style={styles.btnText}>Main Menu</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Floating In-Game Score */}
        {gameState === "PLAYING" && (
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreBadgeText}>🏆 {score}</Text>
          </View>
        )}
      </View>

      {/* Controls */}
      {gameState === "PLAYING" && (
        <View style={styles.controlsContainer}>
          <Pressable
            style={[styles.controlBtn, leftActive && styles.controlBtnActive]}
            onPressIn={() => setLeftActive(true)}
            onPressOut={() => setLeftActive(false)}
          >
            <Text
              style={[
                styles.controlBtnText,
                leftActive && styles.controlBtnTextActive,
              ]}
            >
              ◀ LEFT
            </Text>
          </Pressable>
          <Pressable
            style={[styles.controlBtn, rightActive && styles.controlBtnActive]}
            onPressIn={() => setRightActive(true)}
            onPressOut={() => setRightActive(false)}
          >
            <Text
              style={[
                styles.controlBtnText,
                rightActive && styles.controlBtnTextActive,
              ]}
            >
              RIGHT ▶
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  gameArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
    overflow: "hidden",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(248, 250, 252, 0.4)",
    zIndex: 20,
  },
  overlayDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  glassPanel: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 32,
    padding: 40,
    width: "85%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 40,
    fontWeight: "900",
    color: "#1e293b",
    marginBottom: 5,
    textAlign: "center",
  },
  textDanger: {
    color: "#ef4444",
  },
  subtitle: {
    color: "#64748b",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 28,
  },
  scoreBox: {
    backgroundColor: "#f1f5f9",
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 30,
    marginBottom: 25,
    borderColor: "#cbd5e1",
    borderWidth: 3,
    alignItems: "center",
  },
  scoreLabel: {
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#94a3b8",
    fontWeight: "900",
  },
  scoreValue: {
    fontSize: 48,
    color: "#0f172a",
    fontWeight: "900",
  },
  scoreBadge: {
    position: "absolute",
    top: 50,
    left: 20,
    backgroundColor: "#ffffff",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
    borderColor: "#f8fafc",
    borderWidth: 4,
  },
  scoreBadgeText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
  },
  btn: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 20,
    width: "100%",
    alignItems: "center",
    marginBottom: 16,
  },
  btnText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  btnEasy: { backgroundColor: "#22c55e" },
  btnNormal: { backgroundColor: "#3b82f6" },
  btnHard: { backgroundColor: "#f97316" },
  btnDanger: { backgroundColor: "#ef4444" },
  controlsContainer: {
    height: 100,
    flexDirection: "row",
    backgroundColor: "#ffffff",
    padding: 16,
    gap: 16,
    borderTopWidth: 4,
    borderColor: "#f1f5f9",
  },
  controlBtn: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderWidth: 4,
    borderBottomWidth: 8,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  controlBtnActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#3b82f6",
    borderBottomWidth: 4,
    transform: [{ translateY: 4 }],
  },
  controlBtnText: {
    color: "#64748b",
    fontSize: 20,
    fontWeight: "900",
  },
  controlBtnTextActive: {
    color: "#1d4ed8",
  },
});
