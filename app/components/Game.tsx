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
const DRAIN_RATE_PER_LEVEL = 0.5; // Additional drain per attack level
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
const PROJECTILE_HOMING_STRENGTH = 0.15; // Homing turning rate (0.0-1.0)

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
}

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
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add(e.key);
      }
      if (e.key === ' ' && gameState === 'start') {
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
        player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
        // Only restrict downward movement, allow infinite upward (negative Y) movement
        player.y = Math.min(canvas.height - player.radius, player.y);
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

  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize player position
    playerRef.current.x = canvas.width / 2;
    playerRef.current.y = canvas.height / 2;
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

    // Blood gauge drains over time, drain rate increases with attack level
    const drainRate = BASE_DRAIN_RATE + (player.attackLevel * DRAIN_RATE_PER_LEVEL);
    player.bloodGauge -= drainRate * (deltaTime / 1000);
    if (player.bloodGauge <= 0) {
      setGameState('gameover');
      return;
    }

    // Handle keyboard input
    const moveSpeed = player.baseSpeed + (player.speedLevel * MOVEMENT_SPEED_INCREASE_PER_LEVEL);
    if (keysRef.current.has('ArrowLeft')) player.vx = -moveSpeed;
    else if (keysRef.current.has('ArrowRight')) player.vx = moveSpeed;
    else if (!touchStartRef.current) player.vx = 0;

    if (keysRef.current.has('ArrowUp')) player.vy = -moveSpeed;
    else if (keysRef.current.has('ArrowDown')) player.vy = moveSpeed;
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
        // Calculate number of projectiles to shoot based on level
        const projectileCount = PROJECTILE_COUNT_BASE + Math.floor((player.projectileLevel - 1) / PROJECTILE_COUNT_INCREASE_INTERVAL);
        
        // Find nearest enemies to shoot at
        const enemies = enemiesRef.current;
        const targets: Enemy[] = [];
        
        // Sort enemies by distance
        const sortedEnemies = [...enemies].sort((a, b) => {
          const distA = Math.sqrt((a.x - player.x) ** 2 + (a.y - player.y) ** 2);
          const distB = Math.sqrt((b.x - player.x) ** 2 + (b.y - player.y) ** 2);
          return distA - distB;
        });
        
        // Select up to projectileCount targets
        for (let i = 0; i < Math.min(projectileCount, sortedEnemies.length); i++) {
          targets.push(sortedEnemies[i]);
        }
        
        // If no targets, shoot in multiple directions
        if (targets.length === 0 && projectileCount > 0) {
          const angleStep = (Math.PI * 2) / Math.max(projectileCount, 8);
          for (let i = 0; i < projectileCount; i++) {
            const angle = angleStep * i - Math.PI / 2; // Start from up
            targets.push({
              x: player.x + Math.cos(angle) * 100,
              y: player.y + Math.sin(angle) * 100,
            } as Enemy);
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
          };
          projectilesRef.current.push(projectile);
        }
        
        player.lastProjectileTime = currentTime;
      }
    }

    // Update player position
    player.x += player.vx;
    player.y += player.vy;

    // Keep player in bounds (horizontal only, allow infinite upward movement)
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    // Only restrict downward movement, allow infinite upward (negative Y) movement
    player.y = Math.min(canvas.height - player.radius, player.y);

    // Update camera (follow player vertically, showing upward progression)
    cameraYRef.current = player.y - canvas.height / 2;
    
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
      if (Math.abs(enemy.y - player.y) > canvas.height * 2) {
        enemies.splice(i, 1);
      }
    }

    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      
      // Apply homing behavior for player projectiles
      if (projectile.fromPlayer && projectile.homing) {
        // Find nearest enemy
        let nearestEnemy: Enemy | null = null;
        let nearestDistance = Infinity;
        
        for (const enemy of enemies) {
          const dx = enemy.x - projectile.x;
          const dy = enemy.y - projectile.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < nearestDistance) {
            nearestDistance = distance;
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
            
            // Smoothly interpolate current velocity towards desired velocity
            projectile.vx += (desiredVx - projectile.vx) * PROJECTILE_HOMING_STRENGTH;
            projectile.vy += (desiredVy - projectile.vy) * PROJECTILE_HOMING_STRENGTH;
            
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
      if (Math.abs(projectile.y - player.y) > canvas.height * 2) {
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
      const spawnY = player.y - canvas.height / 2 - 100 - Math.random() * 200;
      const spawnX = Math.random() * canvas.width;
      
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
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const player = playerRef.current;
    const cameraY = cameraYRef.current;

    // Draw grid background
    ctx.strokeStyle = '#2a2a3e';
    ctx.lineWidth = 1;
    const gridSize = 50;
    const offsetY = -cameraY % gridSize;
    
    for (let y = offsetY; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Draw rising darkness from below
    const darknessY = darknessYRef.current;
    const darknessScreenY = darknessY - cameraY;
    
    // Only draw darkness if it's visible on screen
    if (darknessScreenY > -100) {
      // Draw gradient darkness
      const gradient = ctx.createLinearGradient(0, darknessScreenY - 100, 0, darknessScreenY);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.5, 'rgba(20, 0, 30, 0.8)');
      gradient.addColorStop(1, 'rgba(10, 0, 20, 1)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, darknessScreenY - 100, canvas.width, 100);
      
      // Draw solid darkness below
      ctx.fillStyle = 'rgba(10, 0, 20, 1)';
      ctx.fillRect(0, darknessScreenY, canvas.width, canvas.height - darknessScreenY);
      
      // Draw danger line at the edge
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, darknessScreenY);
      ctx.lineTo(canvas.width, darknessScreenY);
      ctx.stroke();
      
      // Add pulsing effect to the danger line
      const pulse = Math.sin(Date.now() / 200) * 0.5 + 0.5;
      ctx.strokeStyle = `rgba(255, 0, 0, ${pulse})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, darknessScreenY);
      ctx.lineTo(canvas.width, darknessScreenY);
      ctx.stroke();
    }

    // Draw attack radius
    ctx.beginPath();
    ctx.arc(player.x, player.y - cameraY, player.attackRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw attack effect
    const attackPhase = (Date.now() % player.attackCooldown) / player.attackCooldown;
    ctx.beginPath();
    ctx.arc(player.x, player.y - cameraY, player.attackRadius * attackPhase, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 0, ${0.5 - attackPhase * 0.5})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw player
    ctx.beginPath();
    ctx.arc(player.x, player.y - cameraY, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#4ecdc4';
    ctx.fill();
    ctx.strokeStyle = '#45b7aa';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw player health bar (blood gauge)
    const healthBarWidth = 60;
    const healthBarHeight = 8;
    const healthPercent = Math.min(1, player.bloodGauge / BLOOD_GAUGE_DISPLAY_REFERENCE);
    
    ctx.fillStyle = '#333';
    ctx.fillRect(
      player.x - healthBarWidth / 2,
      player.y - cameraY - player.radius - 20,
      healthBarWidth,
      healthBarHeight
    );
    
    // Blood gauge uses red color
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(
      player.x - healthBarWidth / 2,
      player.y - cameraY - player.radius - 20,
      healthBarWidth * healthPercent,
      healthBarHeight
    );

    // Draw enemies
    for (const enemy of enemiesRef.current) {
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y - cameraY, enemy.radius, 0, Math.PI * 2);
      ctx.fillStyle = enemy.color;
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Enemy health bar
      const enemyHealthWidth = enemy.radius * 2;
      const enemyHealthHeight = 4;
      const enemyHealthPercent = enemy.health / enemy.maxHealth;
      
      ctx.fillStyle = '#333';
      ctx.fillRect(
        enemy.x - enemyHealthWidth / 2,
        enemy.y - cameraY - enemy.radius - 10,
        enemyHealthWidth,
        enemyHealthHeight
      );
      
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(
        enemy.x - enemyHealthWidth / 2,
        enemy.y - cameraY - enemy.radius - 10,
        enemyHealthWidth * enemyHealthPercent,
        enemyHealthHeight
      );
      
      // Draw enemy level above the health bar
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#ffff00';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      ctx.strokeText(`Lv.${enemy.level}`, enemy.x, enemy.y - cameraY - enemy.radius - 18);
      ctx.fillText(`Lv.${enemy.level}`, enemy.x, enemy.y - cameraY - enemy.radius - 18);
      
      // Draw enemy type indicator
      ctx.font = 'bold 10px sans-serif';
      let typeColor: string;
      let typeLabel: string;
      
      if (enemy.type === 'melee') {
        typeColor = '#ff6b6b';
        typeLabel = '近';
      } else if (enemy.type === 'ranged') {
        typeColor = '#4dabf7';
        typeLabel = '遠';
      } else if (enemy.type === 'explosive') {
        typeColor = '#ff8c00';
        typeLabel = '爆';
      } else { // chaser
        typeColor = '#da77f2';
        typeLabel = '追';
      }
      
      ctx.fillStyle = typeColor;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeText(typeLabel, enemy.x, enemy.y - cameraY + enemy.radius + 15);
      ctx.fillText(typeLabel, enemy.x, enemy.y - cameraY + enemy.radius + 15);
      
      // Draw explosion warning for explosive enemies
      if (enemy.type === 'explosive') {
        const dx = playerRef.current.x - enemy.x;
        const dy = playerRef.current.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < EXPLOSIVE_TRIGGER_DISTANCE * EXPLOSIVE_WARNING_DISTANCE_MULTIPLIER) {
          // Draw warning ring that pulses as enemy gets closer
          const warningPulse = Math.sin(Date.now() / EXPLOSIVE_WARNING_PULSE_SPEED) * 0.5 + 0.5;
          ctx.beginPath();
          ctx.arc(enemy.x, enemy.y - cameraY, enemy.explosionRadius || EXPLOSIVE_EXPLOSION_RADIUS, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 0, 0, ${warningPulse * 0.5})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Draw projectiles
    for (const projectile of projectilesRef.current) {
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y - cameraY, projectile.radius, 0, Math.PI * 2);
      ctx.fillStyle = projectile.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw UI
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`スコア: ${score}`, 20, 40);
    ctx.fillText(`高度: ${Math.floor(-cameraY)}m`, 20, 70);
    ctx.fillText(`血液: ${Math.max(0, Math.floor(player.bloodGauge))}`, 20, 100);
    ctx.fillText(`敵: ${enemiesRef.current.length}`, 20, 130);
    
    // Show all enhancement levels
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`近接攻撃: Lv.${player.attackLevel} (${player.attackDamage})`, 20, 160);
    ctx.fillText(`攻撃範囲: Lv.${player.rangeLevel} (${Math.floor(player.attackRadius)})`, 20, 185);
    ctx.fillText(`移動速度: Lv.${player.speedLevel} (${(player.baseSpeed + player.speedLevel * MOVEMENT_SPEED_INCREASE_PER_LEVEL).toFixed(1)})`, 20, 210);
    
    // Enhanced projectile display
    if (player.projectileLevel > 0) {
      const damage = PROJECTILE_DAMAGE_BASE + (player.projectileLevel - 1) * PROJECTILE_DAMAGE_INCREASE_PER_LEVEL;
      const count = PROJECTILE_COUNT_BASE + Math.floor((player.projectileLevel - 1) / PROJECTILE_COUNT_INCREASE_INTERVAL);
      const cooldown = Math.max(
        PROJECTILE_COOLDOWN_MIN,
        PROJECTILE_COOLDOWN_BASE - (player.projectileLevel - 1) * PROJECTILE_COOLDOWN_REDUCTION_PER_LEVEL
      );
      const hasHoming = player.projectileLevel >= PROJECTILE_HOMING_LEVEL;
      ctx.fillText(
        `飛び道具: Lv.${player.projectileLevel} (威力:${damage}, 弾数:${count}, 間隔:${cooldown}ms${hasHoming ? ', 追尾' : ''})`,
        20,
        235
      );
    } else {
      ctx.fillText(`飛び道具: Lv.${player.projectileLevel}`, 20, 235);
    }
    
    // Show blood drain rate
    const drainRate = BASE_DRAIN_RATE + (player.attackLevel * DRAIN_RATE_PER_LEVEL);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
    ctx.fillText(`血液減少: -${drainRate.toFixed(1)}/秒`, 20, 265);

    // Controls hint
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.textAlign = 'right';
    ctx.fillText('PC: 矢印キー / スマホ: ドラッグ', canvas.width - 20, canvas.height - 20);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-900">
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />
      
      {gameState === 'playing' && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2">
          <button
            onClick={strengthenAttack}
            disabled={bloodGauge < ATTACK_UPGRADE_BASE_COST * (attackLevel + 1)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold text-sm rounded-lg transition-colors shadow-lg"
          >
            近接攻撃力強化<br />Lv.{attackLevel} → {attackLevel + 1}<br />({ATTACK_UPGRADE_BASE_COST * (attackLevel + 1)})
          </button>
          <button
            onClick={strengthenRange}
            disabled={bloodGauge < ATTACK_UPGRADE_BASE_COST * (rangeLevel + 1)}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold text-sm rounded-lg transition-colors shadow-lg"
          >
            攻撃範囲強化<br />Lv.{rangeLevel} → {rangeLevel + 1}<br />({ATTACK_UPGRADE_BASE_COST * (rangeLevel + 1)})
          </button>
          <button
            onClick={strengthenSpeed}
            disabled={bloodGauge < ATTACK_UPGRADE_BASE_COST * (speedLevel + 1)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold text-sm rounded-lg transition-colors shadow-lg"
          >
            移動速度強化<br />Lv.{speedLevel} → {speedLevel + 1}<br />({ATTACK_UPGRADE_BASE_COST * (speedLevel + 1)})
          </button>
          <button
            onClick={strengthenProjectile}
            disabled={bloodGauge < ATTACK_UPGRADE_BASE_COST * (projectileLevel + 1)}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold text-sm rounded-lg transition-colors shadow-lg"
          >
            飛び道具強化<br />Lv.{projectileLevel} → {projectileLevel + 1}<br />({ATTACK_UPGRADE_BASE_COST * (projectileLevel + 1)})
          </button>
        </div>
      )}
      
      {gameState === 'start' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="text-center text-white">
            <h1 className="text-5xl font-bold mb-8">BAKEMONO</h1>
            <p className="text-xl mb-4">2D見下ろし型アクションゲーム</p>
            <p className="mb-8">上を目指して敵を倒せ！</p>
            <div className="space-y-2 mb-8">
              <p>🎮 操作方法:</p>
              <p>PC: 矢印キー (↑↓←→)</p>
              <p>スマホ: 画面をドラッグ</p>
              <p>⚔️ 自動攻撃: 周囲の敵を攻撃</p>
              <p>🎯 飛び道具: 強化後に自動で発射</p>
            </div>
            <button
              onClick={() => setGameState('playing')}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xl rounded-lg transition-colors"
            >
              ゲームスタート
            </button>
          </div>
        </div>
      )}
      
      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="text-center text-white">
            <h1 className="text-5xl font-bold mb-8 text-red-500">GAME OVER</h1>
            <p className="text-3xl mb-4">最終スコア: {score}</p>
            <p className="text-2xl mb-8">到達高度: {Math.floor(-cameraYRef.current)}m</p>
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
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-xl rounded-lg transition-colors"
            >
              もう一度プレイ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
