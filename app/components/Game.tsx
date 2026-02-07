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
}

interface Enemy extends Entity {
  health: number;
  maxHealth: number;
  damage: number;
  speed: number;
  color: string;
  level: number;
  type: 'melee' | 'ranged';
  lastShootTime?: number; // For ranged enemies
  shootCooldown?: number; // For ranged enemies
  preferredDistance?: number; // For ranged enemies
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  color: string;
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
  const [score, setScore] = useState(0);
  const [attackLevel, setAttackLevel] = useState(0);
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
    const moveSpeed = 5;
    if (keysRef.current.has('ArrowLeft')) player.vx = -moveSpeed;
    else if (keysRef.current.has('ArrowRight')) player.vx = moveSpeed;
    else if (!touchStartRef.current) player.vx = 0;

    if (keysRef.current.has('ArrowUp')) player.vy = -moveSpeed;
    else if (keysRef.current.has('ArrowDown')) player.vy = moveSpeed;
    else if (!touchStartRef.current) player.vy = 0;

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
      }

      // Remove enemies that are too far away
      if (Math.abs(enemy.y - player.y) > canvas.height * 2) {
        enemies.splice(i, 1);
      }
    }

    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      
      projectile.x += projectile.vx;
      projectile.y += projectile.vy;
      
      // Check collision with player
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
    const waveCount = 3 + Math.floor(score / WAVE_SCALING_FACTOR);
    
    // Spawn enemies above the player
    for (let i = 0; i < waveCount; i++) {
      const difficulty = 1 + score / DIFFICULTY_SCALING_FACTOR;
      const spawnY = player.y - canvas.height / 2 - 100 - Math.random() * 200;
      const spawnX = Math.random() * canvas.width;
      
      // Calculate enemy level based on altitude (higher = stronger)
      // Level increases every ENEMY_LEVEL_ALTITUDE_INTERVAL units of altitude
      const enemyLevel = Math.max(1, Math.floor(-spawnY / ENEMY_LEVEL_ALTITUDE_INTERVAL) + 1);
      
      // Randomly choose enemy type (50% melee, 50% ranged)
      const enemyType = Math.random() < 0.5 ? 'melee' : 'ranged';

      const enemy: Enemy = {
        x: spawnX,
        y: spawnY,
        vx: 0,
        vy: 0,
        radius: 15 + Math.random() * 5 * difficulty,
        health: 30 * difficulty * enemyLevel,
        maxHealth: 30 * difficulty * enemyLevel,
        damage: 5 * difficulty * enemyLevel,
        speed: enemyType === 'melee' ? 1 + Math.random() * 2 * difficulty : 0.8 + Math.random() * 1.2 * difficulty,
        color: enemyType === 'melee' 
          ? `hsl(0, ${SATURATION}%, ${BASE_LIGHTNESS - difficulty * DIFFICULTY_LIGHTNESS_REDUCTION}%)` // Red for melee
          : `hsl(240, ${SATURATION}%, ${BASE_LIGHTNESS - difficulty * DIFFICULTY_LIGHTNESS_REDUCTION}%)`, // Blue for ranged
        level: enemyLevel,
        type: enemyType,
        lastShootTime: enemyType === 'ranged' ? Date.now() : undefined,
        shootCooldown: enemyType === 'ranged' ? RANGED_ENEMY_SHOOT_COOLDOWN : undefined,
        preferredDistance: enemyType === 'ranged' ? RANGED_ENEMY_PREFERRED_DISTANCE : undefined,
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
      ctx.fillStyle = enemy.type === 'melee' ? '#ff6b6b' : '#4dabf7';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      const typeLabel = enemy.type === 'melee' ? '近' : '遠';
      ctx.strokeText(typeLabel, enemy.x, enemy.y - cameraY + enemy.radius + 15);
      ctx.fillText(typeLabel, enemy.x, enemy.y - cameraY + enemy.radius + 15);
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
    ctx.fillText(`攻撃力: Lv.${player.attackLevel} (${player.attackDamage})`, 20, 160);
    
    // Show blood drain rate
    const drainRate = BASE_DRAIN_RATE + (player.attackLevel * DRAIN_RATE_PER_LEVEL);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
    ctx.fillText(`血液減少: -${drainRate.toFixed(1)}/秒`, 20, 190);

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
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
          <button
            onClick={strengthenAttack}
            disabled={bloodGauge < ATTACK_UPGRADE_BASE_COST * (attackLevel + 1)}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold text-lg rounded-lg transition-colors shadow-lg"
          >
            攻撃力強化 (コスト: {ATTACK_UPGRADE_BASE_COST * (attackLevel + 1)})
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
                playerRef.current.attackDamage = 10;
                setBloodGauge(100);
                setAttackLevel(0);
                cameraYRef.current = 0;
                enemiesRef.current = [];
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
