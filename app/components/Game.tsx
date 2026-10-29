'use client';

import { useEffect, useRef, useState } from 'react';

// Game balance constants
const WAVE_SCALING_FACTOR = 100; // Enemies per wave increase every N score
const DIFFICULTY_SCALING_FACTOR = 500; // Difficulty increases every N score
const HUE_RANGE = 360;
const SATURATION = 70;
const BASE_LIGHTNESS = 50;
const DIFFICULTY_LIGHTNESS_REDUCTION = 5;

// Blood gauge constants
const BASE_DRAIN_RATE = 1; // Blood gauge drain per second at level 0
const DRAIN_RATE_PER_LEVEL = 0.5; // Additional drain per enhancement level
const BLOOD_RECOVERY_MULTIPLIER = 0.5; // Blood recovered from defeated enemies (% of maxHealth)
const BLOOD_GAUGE_DISPLAY_REFERENCE = 100; // Reference value for blood gauge visual display

// Attack strengthening constants
const ATTACK_UPGRADE_BASE_COST = 50; // Base cost for first attack upgrade
const DAMAGE_INCREASE_PER_LEVEL = 5; // Attack damage increase per level
const ATTACK_RANGE_INCREASE_PER_LEVEL = 20; // Attack range increase per level
const MOVEMENT_SPEED_INCREASE_PER_LEVEL = 0.5; // Movement speed increase per level
const PROJECTILE_DAMAGE_BASE = 15; // Base damage for player projectiles
const PROJECTILE_DAMAGE_INCREASE_PER_LEVEL = 5; // Projectile damage increase per level
const PROJECTILE_SPEED_PLAYER = 8; // Speed of player projectiles
const PROJECTILE_COOLDOWN_BASE = 300; // Base cooldown between player projectile shots (ms)
const PROJECTILE_COOLDOWN_REDUCTION_PER_LEVEL = 15; // Cooldown reduction per level (ms)
const PROJECTILE_COOLDOWN_MIN = 100; // Minimum cooldown between shots (ms)
const PROJECTILE_COUNT_BASE = 1; // Base number of projectiles per shot
const PROJECTILE_COUNT_INCREASE_INTERVAL = 3; // Levels between projectile count increases
const PROJECTILE_HOMING_LEVEL = 10; // Level at which projectiles start homing
const PROJECTILE_HOMING_STRENGTH_BASE = 0; // Base homing turning rate at level 10 (minimal)
const PROJECTILE_HOMING_STRENGTH_PER_LEVEL = 0.0000000015; // Homing turning rate increase per level
const PROJECTILE_HOMING_RAMP_TIME = 10000; // Time (ms) for homing to reach full strength
const PROJECTILE_LIFETIME = 5000; // Time (ms) projectile exists before fade-out begins
const PROJECTILE_FADEOUT_TIME = 500; // Time (ms) for fade-out effect
const PROJECTILE_DEFAULT_TARGET_DISTANCE = 100; // Distance for default target when no enemies present

// Darkness constants
const DARKNESS_RISE_SPEED = 0.5; // Speed at which darkness rises (units per frame)
const DARKNESS_START_OFFSET = 200; // Initial distance below player

// Enemy type constants
const ENEMY_LEVEL_ALTITUDE_INTERVAL = 500; // Altitude interval for level increase
const RANGED_DISTANCE_THRESHOLD = 50; // Distance threshold for ranged enemy positioning
const RANGED_ENEMY_SHOOT_COOLDOWN = 2000; // Cooldown between shots (ms)
const RANGED_ENEMY_PREFERRED_DISTANCE = 200; // Preferred distance from player
const PROJECTILE_DAMAGE_MULTIPLIER = 0.5; // Projectile damage relative to enemy damage
const PROJECTILE_SPEED = 3; // Speed of ranged enemy projectiles
const EXPLOSIVE_EXPLOSION_RADIUS = 100; // Explosion radius for explosive enemies
const EXPLOSIVE_TRIGGER_DISTANCE = 80; // Distance at which explosive enemies explode
const EXPLOSIVE_DAMAGE_MULTIPLIER = 3; // Explosion damage multiplier
const EXPLOSIVE_WARNING_DISTANCE_MULTIPLIER = 1.5; // Distance multiplier for showing warning
const EXPLOSIVE_WARNING_PULSE_SPEED = 100; // Animation speed for explosion warning pulse (ms)
const CHASER_TRAIL_COOLDOWN = 500; // Cooldown between trail projectiles (ms)
const CHASER_TRAIL_DAMAGE_MULTIPLIER = 0.3; // Trail projectile damage relative to enemy damage
const CHASER_TRAIL_SPEED_MULTIPLIER = 0.5; // Trail projectile speed relative to normal projectiles

// Enemy type spawn probabilities (level 10-19)
const LEVEL_10_19_MELEE_PROBABILITY = 0.4;
const LEVEL_10_19_RANGED_PROBABILITY = 0.7; // Cumulative: 0.4 melee, 0.3 ranged
// Explosive: remaining probability (0.3)

// Enemy type spawn probabilities (level 20+)
const LEVEL_20_PLUS_MELEE_PROBABILITY = 0.3;
const LEVEL_20_PLUS_RANGED_PROBABILITY = 0.55; // Cumulative: 0.3 melee, 0.25 ranged
const LEVEL_20_PLUS_EXPLOSIVE_PROBABILITY = 0.8; // Cumulative: 0.25 explosive
// Chaser: remaining probability (0.2)

interface Position {
  x: number;
  y: number;
}

interface Entity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface Player extends Entity {
  bloodGauge: number;
  attackRadius: number;
  attackDamage: number;
  attackCooldown: number;
  lastAttackTime: number;
  attackLevel: number;
  rangeLevel: number;
  speedLevel: number;
  projectileLevel: number;
  lastProjectileTime: number;
  baseSpeed: number;
}

interface Enemy extends Entity {
  health: number;
  maxHealth: number;
  damage: number;
  speed: number;
  color: string;
  level: number;
  type: 'melee' | 'ranged' | 'explosive' | 'chaser';
  lastShootTime?: number; // For ranged enemies
  shootCooldown?: number; // For ranged enemies
  preferredDistance?: number; // For ranged enemies
  explosionRadius?: number; // For explosive enemies
  exploded?: boolean; // For explosive enemies
  trailCooldown?: number; // For chaser enemies
  lastTrailTime?: number; // For chaser enemies
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  color: string;
  fromPlayer?: boolean; // Flag to distinguish player projectiles from enemy projectiles
  homing?: boolean; // Whether projectile homes in on enemies
  createdAt?: number; // Timestamp when projectile was created (for fade-out and gradual homing)
}

const drawPlayerSprite = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number) => {
  const scale = radius / 20;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(20, 12, 14, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 14, 19, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#d7c7a2';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-14, 4);
  ctx.lineTo(-22, 18);
  ctx.stroke();
  ctx.fillStyle = '#69443b';
  ctx.fillRect(-25, 16, 8, 3);

  ctx.fillStyle = '#243b55';
  ctx.beginPath();
  ctx.moveTo(-13, -2);
  ctx.quadraticCurveTo(-14, 9, -19, 15);
  ctx.lineTo(-11, 19);
  ctx.lineTo(0, 13);
  ctx.lineTo(11, 19);
  ctx.lineTo(19, 15);
  ctx.quadraticCurveTo(14, 8, 13, -2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c9b276';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#f3e7d2';
  ctx.beginPath();
  ctx.moveTo(-3, -2);
  ctx.lineTo(0, 10);
  ctx.lineTo(4, -2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a83d35';
  ctx.fillRect(-13, 5, 26, 4);

  ctx.fillStyle = '#e4b98e';
  ctx.beginPath();
  ctx.ellipse(0, -10, 9, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#211a20';
  ctx.beginPath();
  ctx.arc(0, -15, 10, Math.PI, Math.PI * 2);
  ctx.quadraticCurveTo(9, -10, 7, -7);
  ctx.lineTo(5, -12);
  ctx.lineTo(-8, -12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a83d35';
  ctx.fillRect(-10, -14, 20, 2);
  ctx.fillStyle = '#29202a';
  ctx.fillRect(-4, -8, 2, 2);
  ctx.fillRect(3, -8, 2, 2);

  const sashWave = Math.sin(time / 180) * 2;
  ctx.fillStyle = '#b33f37';
  ctx.beginPath();
  ctx.moveTo(9, 3);
  ctx.quadraticCurveTo(20, 5 + sashWave, 17, 15 + sashWave);
  ctx.lineTo(13, 11 + sashWave);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawYokaiSprite = (ctx: CanvasRenderingContext2D, enemy: Enemy, y: number, time: number) => {
  const scale = enemy.radius / 20;
  const bob = Math.sin(time / 220 + enemy.x) * 1.5;
  ctx.save();
  ctx.translate(enemy.x, y + bob);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(17, 10, 15, 0.32)';
  ctx.beginPath();
  ctx.ellipse(0, 15, 20, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyColor = enemy.type === 'melee' ? '#b54e4a'
    : enemy.type === 'ranged' ? '#47677d'
      : enemy.type === 'explosive' ? '#cf713c' : '#77558b';
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(-16, 4);
  ctx.quadraticCurveTo(-23, -12, -9, -18);
  ctx.quadraticCurveTo(0, -25, 11, -16);
  ctx.quadraticCurveTo(24, -4, 15, 10);
  ctx.lineTo(9, 17);
  ctx.lineTo(-10, 17);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#30212a';
  ctx.lineWidth = 3;
  ctx.stroke();

  if (enemy.type === 'ranged') {
    ctx.fillStyle = '#352a38';
    ctx.beginPath();
    ctx.ellipse(0, -17, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-2, -26, 4, 10);
  } else if (enemy.type === 'melee' || enemy.type === 'chaser') {
    ctx.fillStyle = '#e5c27a';
    ctx.beginPath();
    ctx.moveTo(-11, -14);
    ctx.lineTo(-19, -25);
    ctx.lineTo(-5, -18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(10, -14);
    ctx.lineTo(18, -25);
    ctx.lineTo(5, -18);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#efc77a';
    ctx.beginPath();
    ctx.arc(0, 0, 23 + Math.sin(time / 90) * 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 164, 74, 0.48)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.fillStyle = '#f5e5c7';
  ctx.beginPath();
  ctx.ellipse(0, -5, 12, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#321c27';
  ctx.beginPath();
  ctx.ellipse(-5, -5, 2.4, 3.2, 0, 0, Math.PI * 2);
  ctx.ellipse(5, -5, 2.4, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#743a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -1, 4, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.restore();
};

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
  const [score, setScore] = useState(0);
  const [attackLevel, setAttackLevel] = useState(0);
  const [rangeLevel, setRangeLevel] = useState(0);
  const [speedLevel, setSpeedLevel] = useState(0);
  const [projectileLevel, setProjectileLevel] = useState(0);
  const [bloodGauge, setBloodGauge] = useState(100);
  
  // Game state refs (mutable for animation loop)
  const playerRef = useRef<Player>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 20,
    bloodGauge: 100,
    attackRadius: 150,
    attackDamage: 10,
    attackCooldown: 500,
    lastAttackTime: 0,
    attackLevel: 0,
    rangeLevel: 0,
    speedLevel: 0,
    projectileLevel: 0,
    lastProjectileTime: 0,
    baseSpeed: 5,
  });
  
  const enemiesRef = useRef<Enemy[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const keysRef = useRef<Set<string>>(new Set());
  const touchStartRef = useRef<Position | null>(null);
  const joystickRef = useRef<Position>({ x: 0, y: 0 });
  const joystickElementRef = useRef<HTMLDivElement>(null);
  const canvasScaleRef = useRef(1);
  const [joystickPosition, setJoystickPosition] = useState<Position>({ x: 0, y: 0 });
  const cameraYRef = useRef(0);
  const lastSpawnTimeRef = useRef(0);
  const gameLoopRef = useRef<number | undefined>(undefined);
  const darknessYRef = useRef(0); // Y position of the rising darkness

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvasScaleRef.current = scale;
      canvas.width = Math.round(window.innerWidth * scale);
      canvas.height = Math.round(window.innerHeight * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add(e.key);
      }
      if ((e.key === ' ' || e.key === 'Enter') && gameState === 'start') {
        e.preventDefault();
        setGameState('playing');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    // Touch controls
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      
      if (gameState === 'start') {
        setGameState('playing');
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!touchStartRef.current) return;

      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      // Move player directly to follow finger drag
      const player = playerRef.current;
      player.x += dx;
      player.y += dy;
      
      // Keep player in bounds (horizontal only, allow infinite upward movement)
      const canvas = canvasRef.current;
      if (canvas) {
        const width = canvas.width / canvasScaleRef.current;
        const height = canvas.height / canvasScaleRef.current;
        player.x = Math.max(player.radius, Math.min(width - player.radius, player.x));
        // Only restrict downward movement, allow infinite upward (negative Y) movement
        player.y = Math.min(height - player.radius, player.y);
      }
      
      // Update touch start position for continuous tracking
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      touchStartRef.current = null;
      playerRef.current.vx = 0;
      playerRef.current.vy = 0;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState]);

  const updateJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const maxDistance = Math.min(bounds.width, bounds.height) * 0.32;
    let x = event.clientX - (bounds.left + bounds.width / 2);
    let y = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(x, y);
    if (distance > maxDistance) {
      x = (x / distance) * maxDistance;
      y = (y / distance) * maxDistance;
    }
    const position = { x: x / maxDistance, y: y / maxDistance };
    joystickRef.current = position;
    setJoystickPosition({ x: position.x * 32, y: position.y * 32 });
  };

  const releaseJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    joystickRef.current = { x: 0, y: 0 };
    setJoystickPosition({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize player position
    playerRef.current.x = (canvas.width / canvasScaleRef.current) / 2;
    playerRef.current.y = (canvas.height / canvasScaleRef.current) / 2;
    enemiesRef.current = [];
    projectilesRef.current = [];
    cameraYRef.current = 0;
    lastSpawnTimeRef.current = Date.now();
    
    // Initialize darkness position below the player
    darknessYRef.current = playerRef.current.y + DARKNESS_START_OFFSET;

    // Game loop
    let lastTime = Date.now();
    const gameLoop = () => {
      const currentTime = Date.now();
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      update(deltaTime);
      render(ctx, canvas);

      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState]);

  const update = (deltaTime: number) => {
    const player = playerRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width / canvasScaleRef.current;
    const height = canvas.height / canvasScaleRef.current;

    // Blood gauge drains over time, drain rate increases with all enhancement levels
    const totalLevels = player.attackLevel + player.rangeLevel + player.speedLevel + player.projectileLevel;
    const drainRate = BASE_DRAIN_RATE + (totalLevels * DRAIN_RATE_PER_LEVEL);
    player.bloodGauge -= drainRate * (deltaTime / 1000);
    if (player.bloodGauge <= 0) {
      setGameState('gameover');
      return;
    }

    // Handle keyboard input
    const moveSpeed = player.baseSpeed + (player.speedLevel * MOVEMENT_SPEED_INCREASE_PER_LEVEL);
    if (keysRef.current.has('ArrowLeft') || keysRef.current.has('a') || keysRef.current.has('A')) player.vx = -moveSpeed;
    else if (keysRef.current.has('ArrowRight') || keysRef.current.has('d') || keysRef.current.has('D')) player.vx = moveSpeed;
    else if (Math.abs(joystickRef.current.x) > 0.08) player.vx = joystickRef.current.x * moveSpeed;
    else if (!touchStartRef.current) player.vx = 0;

    if (keysRef.current.has('ArrowUp') || keysRef.current.has('w') || keysRef.current.has('W')) player.vy = -moveSpeed;
    else if (keysRef.current.has('ArrowDown') || keysRef.current.has('s') || keysRef.current.has('S')) player.vy = moveSpeed;
    else if (Math.abs(joystickRef.current.y) > 0.08) player.vy = joystickRef.current.y * moveSpeed;
    else if (!touchStartRef.current) player.vy = 0;

    // Handle automatic player projectile shooting
    if (player.projectileLevel > 0) {
      const currentTime = Date.now();
      // Calculate cooldown based on level (decreases with level)
      const projectileCooldown = Math.max(
        PROJECTILE_COOLDOWN_MIN,
        PROJECTILE_COOLDOWN_BASE - (player.projectileLevel - 1) * PROJECTILE_COOLDOWN_REDUCTION_PER_LEVEL
      );
      
      if (currentTime - player.lastProjectileTime > projectileCooldown) {
        // Check if there is at least one enemy within melee attack range
        const enemies = enemiesRef.current;
        const attackRadiusSq = player.attackRadius * player.attackRadius;
        const hasEnemyInRange = enemies.some(enemy => {
          const dx = player.x - enemy.x;
          const dy = player.y - enemy.y;
          const distSq = dx * dx + dy * dy;
          return distSq < attackRadiusSq;
        });
        
        // Only shoot if there's an enemy within melee range
        if (hasEnemyInRange) {
        
        // Calculate number of projectiles to shoot based on level
        const projectileCount = PROJECTILE_COUNT_BASE + Math.floor((player.projectileLevel - 1) / PROJECTILE_COUNT_INCREASE_INTERVAL);
        
        // Find nearest enemies to shoot at
        const targets: Array<{ x: number; y: number }> = [];
        
        // Sort enemies by distance (using squared distance for performance)
        const sortedEnemies = [...enemies].sort((a, b) => {
          const distSqA = (a.x - player.x) ** 2 + (a.y - player.y) ** 2;
          const distSqB = (b.x - player.x) ** 2 + (b.y - player.y) ** 2;
          return distSqA - distSqB;
        });
        
        // Select up to projectileCount targets
        for (let i = 0; i < Math.min(projectileCount, sortedEnemies.length); i++) {
          targets.push(sortedEnemies[i]);
        }
        
        // If no targets, shoot in multiple directions
        // projectileCount is guaranteed > 0 by the outer condition (player.projectileLevel > 0)
        if (targets.length === 0 && projectileCount > 0) {
          const angleStep = (2 * Math.PI) / projectileCount; // Divide full circle evenly
          for (let i = 0; i < projectileCount; i++) {
            const angle = angleStep * i; // 0 radians = right (positive x-axis), increases counter-clockwise
            targets.push({
              x: player.x + Math.cos(angle) * PROJECTILE_DEFAULT_TARGET_DISTANCE,
              y: player.y + Math.sin(angle) * PROJECTILE_DEFAULT_TARGET_DISTANCE,
            });
          }
        }
        
        // Shoot projectiles at targets
        const projectileDamage = PROJECTILE_DAMAGE_BASE + (player.projectileLevel - 1) * PROJECTILE_DAMAGE_INCREASE_PER_LEVEL;
        const hasHoming = player.projectileLevel >= PROJECTILE_HOMING_LEVEL;
        
        for (const target of targets) {
          let vx = 0;
          let vy = -PROJECTILE_SPEED_PLAYER; // Default shoot upward
          
          const dx = target.x - player.x;
          const dy = target.y - player.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 0) {
            vx = (dx / distance) * PROJECTILE_SPEED_PLAYER;
            vy = (dy / distance) * PROJECTILE_SPEED_PLAYER;
          }
          
          const projectile: Projectile = {
            x: player.x,
            y: player.y,
            vx: vx,
            vy: vy,
            radius: 6,
            damage: projectileDamage,
            color: hasHoming ? '#ff00ff' : '#ffff00', // Purple for homing, yellow for normal
            fromPlayer: true,
            homing: hasHoming,
            createdAt: currentTime,
          };
          projectilesRef.current.push(projectile);
        }
        
        player.lastProjectileTime = currentTime;
        }
      }
    }

    // Update player position
    player.x += player.vx;
    player.y += player.vy;

    // Keep player in bounds (horizontal only, allow infinite upward movement)
    player.x = Math.max(player.radius, Math.min(width - player.radius, player.x));
    // Only restrict downward movement, allow infinite upward (negative Y) movement
    player.y = Math.min(height - player.radius, player.y);

    // Update camera (follow player vertically, showing upward progression)
    cameraYRef.current = player.y - height / 2;
    
    // Update darkness position - it rises continuously
    darknessYRef.current -= DARKNESS_RISE_SPEED;
    
    // Check if player is caught by darkness
    if (player.y >= darknessYRef.current) {
      setGameState('gameover');
      return;
    }
    
    // Update score based on upward progress
    const newScore = Math.max(0, Math.floor(-cameraYRef.current / 10));
    setScore(newScore);
    
    // Update UI states
    setBloodGauge(player.bloodGauge);
    setAttackLevel(player.attackLevel);
    setRangeLevel(player.rangeLevel);
    setSpeedLevel(player.speedLevel);
    setProjectileLevel(player.projectileLevel);

    // Spawn enemies in waves
    const currentTime = Date.now();
    if (currentTime - lastSpawnTimeRef.current > 2000) {
      spawnEnemyWave();
      lastSpawnTimeRef.current = currentTime;
    }

    // Update enemies
    const enemies = enemiesRef.current;
    const projectiles = projectilesRef.current;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];

      // Calculate distance to player
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (enemy.type === 'melee') {
        // Melee enemy: charge directly at player
        if (distance > 0) {
          enemy.vx = (dx / distance) * enemy.speed;
          enemy.vy = (dy / distance) * enemy.speed;
        }
        
        enemy.x += enemy.vx;
        enemy.y += enemy.vy;
        
        // Melee enemies deal damage on collision
        const collisionDist = player.radius + enemy.radius;
        if (distance < collisionDist) {
          player.bloodGauge -= enemy.damage * (deltaTime / 1000);
          if (player.bloodGauge <= 0) {
            setGameState('gameover');
          }
        }
      } else if (enemy.type === 'ranged') {
        // Ranged enemy: maintain distance and shoot projectiles
        const preferredDist = RANGED_ENEMY_PREFERRED_DISTANCE;
        
        if (distance > preferredDist + RANGED_DISTANCE_THRESHOLD) {
          // Too far, move closer
          if (distance > 0) {
            enemy.vx = (dx / distance) * enemy.speed;
            enemy.vy = (dy / distance) * enemy.speed;
          }
        } else if (distance < preferredDist - RANGED_DISTANCE_THRESHOLD) {
          // Too close, move away
          if (distance > 0) {
            enemy.vx = -(dx / distance) * enemy.speed;
            enemy.vy = -(dy / distance) * enemy.speed;
          }
        } else {
          // At good distance, slow down
          enemy.vx *= 0.9;
          enemy.vy *= 0.9;
        }
        
        enemy.x += enemy.vx;
        enemy.y += enemy.vy;
        
        // Shoot projectiles at player
        const shootCooldown = RANGED_ENEMY_SHOOT_COOLDOWN;
        if (currentTime - (enemy.lastShootTime || 0) > shootCooldown) {
          // Fire projectile
          const projectile: Projectile = {
            x: enemy.x,
            y: enemy.y,
            vx: distance > 0 ? (dx / distance) * PROJECTILE_SPEED : 0,
            vy: distance > 0 ? (dy / distance) * PROJECTILE_SPEED : 0,
            radius: 5,
            damage: enemy.damage * PROJECTILE_DAMAGE_MULTIPLIER,
            color: enemy.color,
          };
          projectiles.push(projectile);
          enemy.lastShootTime = currentTime;
        }
      } else if (enemy.type === 'explosive') {
        // Explosive enemy: charge at player and explode when close
        if (!enemy.exploded) {
          if (distance > 0) {
            enemy.vx = (dx / distance) * enemy.speed;
            enemy.vy = (dy / distance) * enemy.speed;
          }
          
          enemy.x += enemy.vx;
          enemy.y += enemy.vy;
          
          // Explode when close enough to player
          if (distance < EXPLOSIVE_TRIGGER_DISTANCE) {
            enemy.exploded = true;
            
            // Deal area damage to player if within explosion radius
            if (distance < (enemy.explosionRadius || EXPLOSIVE_EXPLOSION_RADIUS)) {
              const damageMultiplier = Math.max(0, 1 - (distance / (enemy.explosionRadius || EXPLOSIVE_EXPLOSION_RADIUS)));
              player.bloodGauge -= enemy.damage * EXPLOSIVE_DAMAGE_MULTIPLIER * damageMultiplier;
              if (player.bloodGauge <= 0) {
                setGameState('gameover');
              }
            }
            
            // Remove the enemy after explosion
            enemies.splice(i, 1);
            continue;
          }
        }
      } else if (enemy.type === 'chaser') {
        // Chaser enemy: fast chase with trail of projectiles
        if (distance > 0) {
          enemy.vx = (dx / distance) * enemy.speed;
          enemy.vy = (dy / distance) * enemy.speed;
        }
        
        enemy.x += enemy.vx;
        enemy.y += enemy.vy;
        
        // Leave trail of projectiles
        const trailCooldown = enemy.trailCooldown || CHASER_TRAIL_COOLDOWN;
        if (currentTime - (enemy.lastTrailTime || 0) > trailCooldown) {
          // Create a projectile at current position that moves slowly toward player
          const projectile: Projectile = {
            x: enemy.x,
            y: enemy.y,
            vx: distance > 0 ? (dx / distance) * PROJECTILE_SPEED * CHASER_TRAIL_SPEED_MULTIPLIER : 0,
            vy: distance > 0 ? (dy / distance) * PROJECTILE_SPEED * CHASER_TRAIL_SPEED_MULTIPLIER : 0,
            radius: 4,
            damage: enemy.damage * CHASER_TRAIL_DAMAGE_MULTIPLIER,
            color: enemy.color,
          };
          projectiles.push(projectile);
          enemy.lastTrailTime = currentTime;
        }
        
        // Chaser enemies deal damage on collision
        const collisionDist = player.radius + enemy.radius;
        if (distance < collisionDist) {
          player.bloodGauge -= enemy.damage * (deltaTime / 1000);
          if (player.bloodGauge <= 0) {
            setGameState('gameover');
          }
        }
      }

      // Remove enemies that are too far away
      if (Math.abs(enemy.y - player.y) > height * 2) {
        enemies.splice(i, 1);
      }
    }

    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      
      // Calculate age once for player projectiles (used for both lifetime check and gradual homing)
      let projectileAge = 0;
      if (projectile.fromPlayer && projectile.createdAt) {
        projectileAge = currentTime - projectile.createdAt;
        
        // Check projectile lifetime and remove if expired
        if (projectileAge > PROJECTILE_LIFETIME + PROJECTILE_FADEOUT_TIME) {
          projectiles.splice(i, 1);
          continue;
        }
      }
      
      // Apply homing behavior for player projectiles
      if (projectile.fromPlayer && projectile.homing && projectile.createdAt) {
        // Calculate homing strength based on projectile level (increases with level)
        const homingStrengthForLevel = PROJECTILE_HOMING_STRENGTH_BASE + 
          (player.projectileLevel - PROJECTILE_HOMING_LEVEL) * PROJECTILE_HOMING_STRENGTH_PER_LEVEL;
        
        // Calculate gradual homing strength based on projectile age
        const homingProgress = Math.min(1.0, projectileAge / PROJECTILE_HOMING_RAMP_TIME);
        const currentHomingStrength = homingStrengthForLevel * homingProgress;
        
        // Find nearest enemy (using squared distance for performance)
        let nearestEnemy: Enemy | null = null;
        let nearestDistSq = Infinity;
        
        for (const enemy of enemies) {
          const dx = enemy.x - projectile.x;
          const dy = enemy.y - projectile.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestEnemy = enemy;
          }
        }
        
        // Adjust velocity towards nearest enemy
        if (nearestEnemy) {
          const dx = nearestEnemy.x - projectile.x;
          const dy = nearestEnemy.y - projectile.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 0) {
            // Calculate desired velocity towards enemy
            const desiredVx = (dx / distance) * PROJECTILE_SPEED_PLAYER;
            const desiredVy = (dy / distance) * PROJECTILE_SPEED_PLAYER;
            
            // Smoothly interpolate current velocity towards desired velocity with gradual strength
            projectile.vx += (desiredVx - projectile.vx) * currentHomingStrength;
            projectile.vy += (desiredVy - projectile.vy) * currentHomingStrength;
            
            // Maintain constant speed
            const speed = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy);
            if (speed > 0) {
              projectile.vx = (projectile.vx / speed) * PROJECTILE_SPEED_PLAYER;
              projectile.vy = (projectile.vy / speed) * PROJECTILE_SPEED_PLAYER;
            }
          }
        }
      }
      
      projectile.x += projectile.vx;
      projectile.y += projectile.vy;
      
      if (projectile.fromPlayer) {
        // Player projectile - check collision with enemies
        let hitEnemy = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
          const enemy = enemies[j];
          const dx = enemy.x - projectile.x;
          const dy = enemy.y - projectile.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < enemy.radius + projectile.radius) {
            enemy.health -= projectile.damage;
            if (enemy.health <= 0) {
              // Recover blood gauge when enemy is defeated
              const baseRecovery = 30 * BLOOD_RECOVERY_MULTIPLIER;
              const bloodRecovery = Math.floor(baseRecovery * enemy.level);
              player.bloodGauge += bloodRecovery;
              enemies.splice(j, 1);
            }
            hitEnemy = true;
            break;
          }
        }
        
        if (hitEnemy) {
          projectiles.splice(i, 1);
          continue;
        }
      } else {
        // Enemy projectile - check collision with player
        const dx = player.x - projectile.x;
        const dy = player.y - projectile.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < player.radius + projectile.radius) {
          player.bloodGauge -= projectile.damage;
          if (player.bloodGauge <= 0) {
            setGameState('gameover');
          }
          projectiles.splice(i, 1);
          continue;
        }
      }
      
      // Remove projectiles that are too far away
      if (Math.abs(projectile.y - player.y) > height * 2) {
        projectiles.splice(i, 1);
      }
    }

    // Auto-attack
    if (currentTime - player.lastAttackTime > player.attackCooldown) {
      for (const enemy of enemies) {
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < player.attackRadius) {
          enemy.health -= player.attackDamage;
          if (enemy.health <= 0) {
            const index = enemies.indexOf(enemy);
            if (index > -1) {
              // Recover blood gauge when enemy is defeated
              // Blood recovery scales with enemy level - higher level enemies restore more blood
              // Using base health (30) scaled by level to avoid quadratic scaling
              const baseRecovery = 30 * BLOOD_RECOVERY_MULTIPLIER;
              const bloodRecovery = Math.floor(baseRecovery * enemy.level);
              player.bloodGauge += bloodRecovery;
              enemies.splice(index, 1);
            }
          }
        }
      }
      player.lastAttackTime = currentTime;
    }
  };

  const spawnEnemyWave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const player = playerRef.current;
    const width = canvas.width / canvasScaleRef.current;
    const height = canvas.height / canvasScaleRef.current;
    
    // Calculate altitude-based enemy count
    // Start with fewer enemies at low altitude, increase as player goes higher
    const altitude = Math.max(0, -player.y);
    const minEnemyCount = 1; // Start with just 1 enemy
    const altitudeMultiplier = Math.floor(altitude / 300); // Increase count every 300 units
    const scoreMultiplier = Math.floor(score / WAVE_SCALING_FACTOR);
    const waveCount = minEnemyCount + altitudeMultiplier + scoreMultiplier;
    
    // Spawn enemies above the player
    for (let i = 0; i < waveCount; i++) {
      const difficulty = 1 + score / DIFFICULTY_SCALING_FACTOR;
      const spawnY = player.y - height / 2 - 100 - Math.random() * 200;
      const spawnX = Math.random() * width;
      
      // Calculate enemy level based on altitude (higher = stronger)
      // Level increases every ENEMY_LEVEL_ALTITUDE_INTERVAL units of altitude
      const enemyLevel = Math.max(1, Math.floor(-spawnY / ENEMY_LEVEL_ALTITUDE_INTERVAL) + 1);
      
      // Choose enemy type based on level
      // Level 1-5: Only melee enemies
      // Level 6-9: Melee and ranged enemies
      // Level 10-19: Melee, ranged, and explosive enemies
      // Level 20+: All enemy types including chaser
      let enemyType: 'melee' | 'ranged' | 'explosive' | 'chaser';
      
      if (enemyLevel <= 5) {
        // Only melee enemies
        enemyType = 'melee';
      } else if (enemyLevel <= 9) {
        // Melee and ranged enemies (50% each)
        enemyType = Math.random() < 0.5 ? 'melee' : 'ranged';
      } else if (enemyLevel <= 19) {
        // Melee, ranged, and explosive enemies
        const rand = Math.random();
        if (rand < LEVEL_10_19_MELEE_PROBABILITY) {
          enemyType = 'melee';
        } else if (rand < LEVEL_10_19_RANGED_PROBABILITY) {
          enemyType = 'ranged';
        } else {
          enemyType = 'explosive';
        }
      } else {
        // All enemy types
        const rand = Math.random();
        if (rand < LEVEL_20_PLUS_MELEE_PROBABILITY) {
          enemyType = 'melee';
        } else if (rand < LEVEL_20_PLUS_RANGED_PROBABILITY) {
          enemyType = 'ranged';
        } else if (rand < LEVEL_20_PLUS_EXPLOSIVE_PROBABILITY) {
          enemyType = 'explosive';
        } else {
          enemyType = 'chaser';
        }
      }

      // Set enemy properties based on type
      let enemySpeed: number;
      let enemyColor: string;
      
      if (enemyType === 'melee') {
        enemySpeed = 1 + Math.random() * 2 * difficulty;
        enemyColor = `hsl(0, ${SATURATION}%, ${BASE_LIGHTNESS - difficulty * DIFFICULTY_LIGHTNESS_REDUCTION}%)`; // Red
      } else if (enemyType === 'ranged') {
        enemySpeed = 0.8 + Math.random() * 1.2 * difficulty;
        enemyColor = `hsl(240, ${SATURATION}%, ${BASE_LIGHTNESS - difficulty * DIFFICULTY_LIGHTNESS_REDUCTION}%)`; // Blue
      } else if (enemyType === 'explosive') {
        enemySpeed = 1.5 + Math.random() * 2 * difficulty; // Faster than melee
        enemyColor = `hsl(30, ${SATURATION}%, ${BASE_LIGHTNESS - difficulty * DIFFICULTY_LIGHTNESS_REDUCTION}%)`; // Orange
      } else { // chaser
        enemySpeed = 2 + Math.random() * 2.5 * difficulty; // Fastest
        enemyColor = `hsl(280, ${SATURATION}%, ${BASE_LIGHTNESS - difficulty * DIFFICULTY_LIGHTNESS_REDUCTION}%)`; // Purple
      }

      const enemy: Enemy = {
        x: spawnX,
        y: spawnY,
        vx: 0,
        vy: 0,
        radius: 15 + Math.random() * 5 * difficulty,
        health: 30 * difficulty * enemyLevel,
        maxHealth: 30 * difficulty * enemyLevel,
        damage: 5 * difficulty * enemyLevel,
        speed: enemySpeed,
        color: enemyColor,
        level: enemyLevel,
        type: enemyType,
        lastShootTime: enemyType === 'ranged' ? Date.now() : undefined,
        shootCooldown: enemyType === 'ranged' ? RANGED_ENEMY_SHOOT_COOLDOWN : undefined,
        preferredDistance: enemyType === 'ranged' ? RANGED_ENEMY_PREFERRED_DISTANCE : undefined,
        explosionRadius: enemyType === 'explosive' ? EXPLOSIVE_EXPLOSION_RADIUS : undefined,
        exploded: enemyType === 'explosive' ? false : undefined,
        trailCooldown: enemyType === 'chaser' ? CHASER_TRAIL_COOLDOWN : undefined,
        lastTrailTime: enemyType === 'chaser' ? Date.now() : undefined,
      };

      enemiesRef.current.push(enemy);
    }
  };

  const strengthenAttack = () => {
    const player = playerRef.current;
    // Cost increases with each level: 50, 100, 150, 200, etc.
    const cost = ATTACK_UPGRADE_BASE_COST * (player.attackLevel + 1);
    
    if (player.bloodGauge >= cost) {
      player.bloodGauge -= cost;
      player.attackLevel += 1;
      player.attackDamage += DAMAGE_INCREASE_PER_LEVEL;
      setBloodGauge(player.bloodGauge);
      setAttackLevel(player.attackLevel);
    }
  };

  const strengthenRange = () => {
    const player = playerRef.current;
    const cost = ATTACK_UPGRADE_BASE_COST * (player.rangeLevel + 1);
    
    if (player.bloodGauge >= cost) {
      player.bloodGauge -= cost;
      player.rangeLevel += 1;
      player.attackRadius += ATTACK_RANGE_INCREASE_PER_LEVEL;
      setBloodGauge(player.bloodGauge);
      setRangeLevel(player.rangeLevel);
    }
  };

  const strengthenSpeed = () => {
    const player = playerRef.current;
    const cost = ATTACK_UPGRADE_BASE_COST * (player.speedLevel + 1);
    
    if (player.bloodGauge >= cost) {
      player.bloodGauge -= cost;
      player.speedLevel += 1;
      setBloodGauge(player.bloodGauge);
      setSpeedLevel(player.speedLevel);
    }
  };

  const strengthenProjectile = () => {
    const player = playerRef.current;
    const cost = ATTACK_UPGRADE_BASE_COST * (player.projectileLevel + 1);
    
    if (player.bloodGauge >= cost) {
      player.bloodGauge -= cost;
      player.projectileLevel += 1;
      setBloodGauge(player.bloodGauge);
      setProjectileLevel(player.projectileLevel);
    }
  };

  const render = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const player = playerRef.current;
    const cameraY = cameraYRef.current;
    const width = canvas.width / canvasScaleRef.current;
    const height = canvas.height / canvasScaleRef.current;
    const time = Date.now();

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#142d38');
    sky.addColorStop(0.52, '#31514c');
    sky.addColorStop(1, '#263a38');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(217, 195, 139, 0.1)';
    ctx.beginPath();
    ctx.arc(width * 0.78, height * 0.18, Math.min(width, height) * 0.12, 0, Math.PI * 2);
    ctx.fill();

    const roadWidth = Math.min(340, width * 0.76);
    const roadCenterAt = (worldY: number) => width / 2 + Math.sin(worldY / 470) * width * 0.16;
    const firstSegment = Math.floor(cameraY / 180) - 2;
    const lastSegment = Math.ceil((cameraY + height) / 180) + 2;

    ctx.beginPath();
    for (let segment = firstSegment; segment <= lastSegment; segment++) {
      const worldY = segment * 180;
      const screenY = worldY - cameraY;
      const center = roadCenterAt(worldY);
      if (segment === firstSegment) ctx.moveTo(center - roadWidth / 2, screenY);
      else ctx.lineTo(center - roadWidth / 2, screenY);
    }
    for (let segment = lastSegment; segment >= firstSegment; segment--) {
      const worldY = segment * 180;
      const screenY = worldY - cameraY;
      const center = roadCenterAt(worldY);
      ctx.lineTo(center + roadWidth / 2, screenY);
    }
    ctx.closePath();
    const pathGradient = ctx.createLinearGradient(0, 0, width, 0);
    pathGradient.addColorStop(0, '#514a3b');
    pathGradient.addColorStop(0.5, '#81735a');
    pathGradient.addColorStop(1, '#514a3b');
    ctx.fillStyle = pathGradient;
    ctx.fill();

    ctx.lineWidth = 3;
    for (let segment = Math.floor(cameraY / 48) - 1; segment <= Math.ceil((cameraY + height) / 48) + 1; segment++) {
      const worldY = segment * 48;
      const screenY = worldY - cameraY;
      const center = roadCenterAt(worldY);
      ctx.strokeStyle = 'rgba(223, 204, 157, 0.14)';
      ctx.beginPath();
      ctx.moveTo(center - roadWidth / 2 + 5, screenY);
      ctx.lineTo(center + roadWidth / 2 - 5, screenY);
      ctx.stroke();
    }

    const sceneryStep = 260;
    const firstScenery = Math.floor(cameraY / sceneryStep) - 1;
    const lastScenery = Math.ceil((cameraY + height) / sceneryStep) + 1;
    for (let section = firstScenery; section <= lastScenery; section++) {
      const worldY = section * sceneryStep;
      const screenY = worldY - cameraY;
      const center = roadCenterAt(worldY);
      const side = Math.max(26, (width - roadWidth) / 2 - 22);

      for (const direction of [-1, 1]) {
        const x = center + direction * (roadWidth / 2 + side * 0.55);
        ctx.strokeStyle = 'rgba(17, 47, 42, 0.88)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x - 9, screenY + 52);
        ctx.lineTo(x - 7, screenY - 38);
        ctx.moveTo(x + 5, screenY + 50);
        ctx.lineTo(x + 7, screenY - 48);
        ctx.stroke();
        for (let leaf = 0; leaf < 4; leaf++) {
          const leafY = screenY - 35 + leaf * 22;
          ctx.strokeStyle = 'rgba(45, 93, 70, 0.9)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x - 7, leafY);
          ctx.lineTo(x - 22, leafY - 8);
          ctx.moveTo(x + 7, leafY - 8);
          ctx.lineTo(x + 21, leafY + 2);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(177, 151, 92, 0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - 12, leafY - 3);
          ctx.lineTo(x - 6, leafY + 2);
          ctx.moveTo(x + 11, leafY - 10);
          ctx.lineTo(x + 6, leafY - 4);
          ctx.stroke();
        }

        const lanternX = x + direction * 34;
        ctx.fillStyle = '#352b28';
        ctx.fillRect(lanternX - 7, screenY + 34, 14, 20);
        ctx.fillStyle = '#e6a552';
        ctx.fillRect(lanternX - 4, screenY + 38, 8, 12);
        ctx.fillStyle = 'rgba(255, 190, 99, 0.18)';
        ctx.beginPath();
        ctx.arc(lanternX, screenY + 44, 18, 0, Math.PI * 2);
        ctx.fill();
      }

      if (section % 4 === 0) {
        const gateY = screenY - 70;
        const halfSpan = Math.min(roadWidth * 0.38, 118);
        ctx.strokeStyle = '#713a30';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(center - halfSpan, gateY + 48);
        ctx.lineTo(center - halfSpan, gateY - 18);
        ctx.moveTo(center + halfSpan, gateY + 48);
        ctx.lineTo(center + halfSpan, gateY - 18);
        ctx.stroke();
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#a24f39';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(center - halfSpan - 18, gateY - 18);
        ctx.quadraticCurveTo(center, gateY - 31, center + halfSpan + 18, gateY - 18);
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.strokeStyle = '#d09a5a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(center - halfSpan - 13, gateY - 7);
        ctx.lineTo(center + halfSpan + 13, gateY - 7);
        ctx.stroke();
      }
    }

    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.16, width / 2, height / 2, width * 0.8);
    vignette.addColorStop(0, 'rgba(8, 14, 16, 0)');
    vignette.addColorStop(1, 'rgba(8, 14, 16, 0.46)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // Draw rising darkness from below
    const darknessY = darknessYRef.current;
    const darknessScreenY = darknessY - cameraY;
    
    // Only draw darkness if it's visible on screen
    if (darknessScreenY > -100) {
      // Draw gradient darkness
      const gradient = ctx.createLinearGradient(0, darknessScreenY - 140, 0, darknessScreenY);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.5, 'rgba(30, 17, 34, 0.76)');
      gradient.addColorStop(1, 'rgba(16, 13, 24, 0.98)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, darknessScreenY - 140, width, 140);
      
      // Draw solid darkness below
      ctx.fillStyle = 'rgba(16, 13, 24, 0.98)';
      ctx.fillRect(0, darknessScreenY, width, height - darknessScreenY);
      
      // Draw danger line at the edge
      ctx.strokeStyle = '#d55b53';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, darknessScreenY);
      ctx.lineTo(width, darknessScreenY);
      ctx.stroke();
      
      // Add pulsing effect to the danger line
      const pulse = Math.sin(time / 200) * 0.5 + 0.5;
      ctx.strokeStyle = `rgba(255, 164, 119, ${pulse * 0.65})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, darknessScreenY);
      ctx.lineTo(width, darknessScreenY);
      ctx.stroke();
    }

    // Draw attack radius
    ctx.beginPath();
    ctx.arc(player.x, player.y - cameraY, player.attackRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(224, 187, 111, 0.17)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw attack effect
    const attackPhase = (Date.now() % player.attackCooldown) / player.attackCooldown;
    ctx.beginPath();
    ctx.arc(player.x, player.y - cameraY, player.attackRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * attackPhase);
    ctx.strokeStyle = `rgba(255, 224, 154, ${0.4 - attackPhase * 0.3})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    drawPlayerSprite(ctx, player.x, player.y - cameraY, player.radius, time);

    // Draw enemies
    for (const enemy of enemiesRef.current) {
      const enemyScreenY = enemy.y - cameraY;
      drawYokaiSprite(ctx, enemy, enemyScreenY, time);

      // Enemy health bar
      const enemyHealthWidth = enemy.radius * 2;
      const enemyHealthHeight = 4;
      const enemyHealthPercent = Math.max(0, enemy.health / enemy.maxHealth);
      ctx.fillStyle = 'rgba(20, 17, 19, 0.75)';
      ctx.fillRect(enemy.x - enemyHealthWidth / 2, enemyScreenY - enemy.radius - 11, enemyHealthWidth, enemyHealthHeight);
      ctx.fillStyle = '#cb6655';
      ctx.fillRect(enemy.x - enemyHealthWidth / 2, enemyScreenY - enemy.radius - 11, enemyHealthWidth * enemyHealthPercent, enemyHealthHeight);

      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#f1d59c';
      ctx.strokeStyle = 'rgba(24, 19, 23, 0.86)';
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      ctx.strokeText(`Lv.${enemy.level}`, enemy.x, enemyScreenY - enemy.radius - 15);
      ctx.fillText(`Lv.${enemy.level}`, enemy.x, enemyScreenY - enemy.radius - 15);

      const typeLabel = enemy.type === 'melee' ? '鬼' : enemy.type === 'ranged' ? '傘' : enemy.type === 'explosive' ? '火' : '追';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#fff0d3';
      ctx.strokeText(typeLabel, enemy.x, enemyScreenY + enemy.radius + 12);
      ctx.fillText(typeLabel, enemy.x, enemyScreenY + enemy.radius + 12);

      // Draw explosion warning for explosive enemies
      if (enemy.type === 'explosive') {
        const dx = playerRef.current.x - enemy.x;
        const dy = playerRef.current.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < EXPLOSIVE_TRIGGER_DISTANCE * EXPLOSIVE_WARNING_DISTANCE_MULTIPLIER) {
          // Draw warning ring that pulses as enemy gets closer
          const warningPulse = Math.sin(time / EXPLOSIVE_WARNING_PULSE_SPEED) * 0.5 + 0.5;
          ctx.fillStyle = `rgba(209, 77, 54, ${warningPulse * 0.1})`;
          ctx.beginPath();
          ctx.arc(enemy.x, enemyScreenY, enemy.explosionRadius || EXPLOSIVE_EXPLOSION_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(255, 188, 124, ${warningPulse * 0.68})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Draw projectiles
    const currentTime = time;
    for (const projectile of projectilesRef.current) {
      // Calculate alpha for fade-out effect
      let alpha = 1.0;
      if (projectile.fromPlayer && projectile.createdAt) {
        const age = currentTime - projectile.createdAt;
        if (age > PROJECTILE_LIFETIME) {
          // Start fading out after lifetime expires
          const fadeProgress = (age - PROJECTILE_LIFETIME) / PROJECTILE_FADEOUT_TIME;
          alpha = Math.max(0, 1.0 - fadeProgress);
        }
      }
      
      ctx.globalAlpha = alpha;
      ctx.shadowColor = projectile.fromPlayer ? '#ffe4a0' : projectile.color;
      ctx.shadowBlur = projectile.fromPlayer ? 13 : 7;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y - cameraY, projectile.radius, 0, Math.PI * 2);
      ctx.fillStyle = projectile.fromPlayer ? '#ffe4a0' : projectile.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    const panelWidth = Math.min(310, width - 24);
    ctx.fillStyle = 'rgba(21, 31, 31, 0.78)';
    ctx.strokeStyle = 'rgba(220, 195, 143, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(12, 12, panelWidth, 94, 12);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#f5e5c7';
    ctx.fillText(` score ${score}   高度 ${Math.floor(-cameraY)}m   妖 ${enemiesRef.current.length}`, 24, 36);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#fff0db';
    ctx.fillText(`血の残量  ${Math.max(0, Math.floor(player.bloodGauge))}`, 24, 60);
    const gaugeWidth = panelWidth - 24;
    ctx.fillStyle = 'rgba(5, 8, 9, 0.7)';
    ctx.beginPath();
    ctx.roundRect(24, 69, gaugeWidth, 11, 5);
    ctx.fill();
    const healthPercent = Math.max(0, Math.min(1, player.bloodGauge / BLOOD_GAUGE_DISPLAY_REFERENCE));
    const bloodGradient = ctx.createLinearGradient(24, 0, 24 + gaugeWidth, 0);
    bloodGradient.addColorStop(0, '#8e2c36');
    bloodGradient.addColorStop(1, '#e37754');
    ctx.fillStyle = bloodGradient;
    ctx.beginPath();
    ctx.roundRect(24, 69, gaugeWidth * healthPercent, 11, 5);
    ctx.fill();
    const totalLevels = player.attackLevel + player.rangeLevel + player.speedLevel + player.projectileLevel;
    const drainRate = BASE_DRAIN_RATE + totalLevels * DRAIN_RATE_PER_LEVEL;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#d9c79d';
    ctx.fillText(`強化 ${player.attackLevel}/${player.rangeLevel}/${player.speedLevel}/${player.projectileLevel}   血消費 -${drainRate.toFixed(1)}/秒`, 24, 96);
  };

  return (
    <main className="relative h-[100dvh] min-h-[320px] w-full overflow-hidden bg-[#142d38] text-[#f5e5c7] select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="江戸の山道を進み、妖怪から逃げながら血を保つアクションゲーム"
        style={{ touchAction: 'none', userSelect: 'none' }}
      />
      
      {gameState === 'playing' && (
        <>
          <div
            ref={joystickElementRef}
            className="absolute bottom-4 left-3 flex h-[88px] w-[88px] touch-none items-center justify-center rounded-full border border-[#d6bc84]/70 bg-[#17201f]/75 shadow-lg shadow-black/30 lg:hidden"
            style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            role="group"
            aria-label="移動スティック"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              updateJoystick(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) updateJoystick(event);
            }}
            onPointerUp={releaseJoystick}
            onPointerCancel={releaseJoystick}
          >
            <span className="pointer-events-none absolute text-[10px] font-semibold tracking-widest text-[#d9c79d]/70">移動</span>
            <span
              className="pointer-events-none absolute h-10 w-10 rounded-full border border-[#f1d59c]/80 bg-[#a24f39]/90 shadow-md"
              style={{ transform: `translate(${joystickPosition.x}px, ${joystickPosition.y}px)` }}
            />
          </div>
          <div
            className="absolute bottom-3 left-[102px] right-3 grid grid-cols-2 gap-1.5 lg:left-1/2 lg:right-auto lg:w-max lg:-translate-x-1/2 sm:grid-cols-4 sm:gap-2"
            style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
          <button
            onClick={strengthenAttack}
            disabled={bloodGauge < ATTACK_UPGRADE_BASE_COST * (attackLevel + 1)}
            aria-label={`攻撃力強化。レベル${attackLevel}から${attackLevel + 1}、血液${ATTACK_UPGRADE_BASE_COST * (attackLevel + 1)}`}
            className="min-h-[54px] rounded-lg border border-[#cf7160]/70 bg-[#542c2c]/95 px-2 py-1.5 text-center text-[10px] font-bold text-[#fff1dd] shadow-lg disabled:cursor-not-allowed disabled:opacity-45 sm:px-3 sm:text-sm"
          >
            攻撃力　Lv.{attackLevel} → {attackLevel + 1}<br />血 {ATTACK_UPGRADE_BASE_COST * (attackLevel + 1)}
          </button>
          <button
            onClick={strengthenRange}
            disabled={bloodGauge < ATTACK_UPGRADE_BASE_COST * (rangeLevel + 1)}
            aria-label={`攻撃範囲強化。レベル${rangeLevel}から${rangeLevel + 1}、血液${ATTACK_UPGRADE_BASE_COST * (rangeLevel + 1)}`}
            className="min-h-[54px] rounded-lg border border-[#d6a960]/70 bg-[#59432a]/95 px-2 py-1.5 text-center text-[10px] font-bold text-[#fff1dd] shadow-lg disabled:cursor-not-allowed disabled:opacity-45 sm:px-3 sm:text-sm"
          >
            攻撃範囲　Lv.{rangeLevel} → {rangeLevel + 1}<br />血 {ATTACK_UPGRADE_BASE_COST * (rangeLevel + 1)}
          </button>
          <button
            onClick={strengthenSpeed}
            disabled={bloodGauge < ATTACK_UPGRADE_BASE_COST * (speedLevel + 1)}
            aria-label={`移動速度強化。レベル${speedLevel}から${speedLevel + 1}、血液${ATTACK_UPGRADE_BASE_COST * (speedLevel + 1)}`}
            className="min-h-[54px] rounded-lg border border-[#789572]/70 bg-[#304638]/95 px-2 py-1.5 text-center text-[10px] font-bold text-[#fff1dd] shadow-lg disabled:cursor-not-allowed disabled:opacity-45 sm:px-3 sm:text-sm"
          >
            移動速度　Lv.{speedLevel} → {speedLevel + 1}<br />血 {ATTACK_UPGRADE_BASE_COST * (speedLevel + 1)}
          </button>
          <button
            onClick={strengthenProjectile}
            disabled={bloodGauge < ATTACK_UPGRADE_BASE_COST * (projectileLevel + 1)}
            aria-label={`飛び道具強化。レベル${projectileLevel}から${projectileLevel + 1}、血液${ATTACK_UPGRADE_BASE_COST * (projectileLevel + 1)}`}
            className="min-h-[54px] rounded-lg border border-[#d6bc84]/70 bg-[#554a2d]/95 px-2 py-1.5 text-center text-[10px] font-bold text-[#fff1dd] shadow-lg disabled:cursor-not-allowed disabled:opacity-45 sm:px-3 sm:text-sm"
          >
            飛び道具　Lv.{projectileLevel} → {projectileLevel + 1}<br />血 {ATTACK_UPGRADE_BASE_COST * (projectileLevel + 1)}
          </button>
          </div>
        </>
      )}
      
      {gameState === 'start' && (
        <div className="start-screen absolute inset-0 flex items-center justify-center overflow-y-auto bg-[#10181a]/75 px-4 py-6">
          <div className="start-screen-panel w-full max-w-lg rounded-2xl border border-[#c7a86f]/70 bg-[#202b29]/95 px-6 py-7 text-center shadow-2xl shadow-black/50 sm:px-10 sm:py-9">
            <p className="start-screen-kicker mb-2 text-xs font-semibold tracking-[0.35em] text-[#d5b879]">江戸異聞・血の山道</p>
            <h1 className="start-screen-title mb-3 text-4xl font-black tracking-[0.08em] text-[#f0dfbd] sm:text-6xl sm:tracking-[0.16em]">BAKEMONO</h1>
            <div className="start-screen-divider mx-auto mb-5 h-px w-24 bg-[#a24f39]" />
            <p className="start-screen-lead mb-2 text-lg font-bold text-[#e9d8b5]">血ひとつを頼りに、妖の山を越えろ。</p>
            <p className="start-screen-copy mb-6 text-sm leading-6 text-[#c5c0ae]">妖怪を倒して血をつなぎ、迫る闇より高みを目指せ。</p>
            <div className="start-screen-help mb-7 space-y-2 rounded-xl border border-[#d6bc84]/20 bg-black/20 px-4 py-4 text-sm text-[#e7deca]">
              <p><span className="font-bold text-[#d8b66f]">PC</span>　矢印キー / WASD で移動</p>
              <p><span className="font-bold text-[#d8b66f]">スマホ</span>　左スティック、または画面ドラッグ</p>
              <p className="text-xs text-[#b8b09e]">自動攻撃。強化には血を使います。</p>
            </div>
            <button
              onClick={() => setGameState('playing')}
              className="start-screen-button min-h-14 rounded-lg border border-[#e1c27d] bg-[#8d4336] px-10 py-3 text-lg font-bold text-[#fff1d7] shadow-lg transition-colors hover:bg-[#a24f39]"
            >
              山へ入る
            </button>
          </div>
        </div>
      )}
      
      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#101315]/80 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[#a24f39]/70 bg-[#202725]/95 px-7 py-9 text-center shadow-2xl">
            <p className="mb-2 text-sm tracking-[0.3em] text-[#d5b879]">旅はここで途絶えた</p>
            <h1 className="mb-7 text-4xl font-black tracking-widest text-[#d97864] sm:text-5xl">GAME OVER</h1>
            <p className="mb-3 text-2xl font-bold">最終スコア　{score}</p>
            <p className="mb-8 text-lg text-[#d9c79d]">到達高度　{Math.floor(-cameraYRef.current)}m</p>
            <button
              onClick={() => {
                setGameState('start');
                setScore(0);
                playerRef.current.bloodGauge = 100;
                playerRef.current.attackLevel = 0;
                playerRef.current.rangeLevel = 0;
                playerRef.current.speedLevel = 0;
                playerRef.current.projectileLevel = 0;
                playerRef.current.attackDamage = 10;
                playerRef.current.attackRadius = 150;
                playerRef.current.baseSpeed = 5;
                setBloodGauge(100);
                setAttackLevel(0);
                setRangeLevel(0);
                setSpeedLevel(0);
                setProjectileLevel(0);
                cameraYRef.current = 0;
                enemiesRef.current = [];
                projectilesRef.current = [];
              }}
              className="min-h-14 rounded-lg border border-[#d6bc84] bg-[#405441] px-8 py-3 text-lg font-bold text-[#fff1d7] transition-colors hover:bg-[#526b50]"
            >
              もう一度、山へ
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
