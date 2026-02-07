'use client';

import { useEffect, useRef, useState } from 'react';

// Game balance constants
const WAVE_SCALING_FACTOR = 100; // Enemies per wave increase every N score
const DIFFICULTY_SCALING_FACTOR = 500; // Difficulty increases every N score
const HUE_RANGE = 360;
const SATURATION = 70;
const BASE_LIGHTNESS = 50;
const DIFFICULTY_LIGHTNESS_REDUCTION = 5;

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
  const keysRef = useRef<Set<string>>(new Set());
  const touchStartRef = useRef<Position | null>(null);
  const cameraYRef = useRef(0);
  const lastSpawnTimeRef = useRef(0);
  const gameLoopRef = useRef<number | undefined>(undefined);

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
    cameraYRef.current = 0;
    lastSpawnTimeRef.current = Date.now();

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

    // Blood gauge drains over time
    player.bloodGauge -= 1 * (deltaTime / 1000);
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

    // Keep player in bounds
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

    // Update camera (follow player vertically, showing upward progression)
    cameraYRef.current = player.y - canvas.height / 2;
    
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
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];

      // Move enemy towards player
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 0) {
        enemy.vx = (dx / distance) * enemy.speed;
        enemy.vy = (dy / distance) * enemy.speed;
      }

      enemy.x += enemy.vx;
      enemy.y += enemy.vy;

      // Check collision with player
      const collisionDist = player.radius + enemy.radius;
      if (distance < collisionDist) {
        player.bloodGauge -= enemy.damage * (deltaTime / 1000);
        if (player.bloodGauge <= 0) {
          setGameState('gameover');
        }
      }

      // Remove enemies that are too far away
      if (Math.abs(enemy.y - player.y) > canvas.height * 2) {
        enemies.splice(i, 1);
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
              // Stronger enemies (higher maxHealth) restore more blood
              const bloodRecovery = Math.floor(enemy.maxHealth * 0.5);
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

      const enemy: Enemy = {
        x: spawnX,
        y: spawnY,
        vx: 0,
        vy: 0,
        radius: 15 + Math.random() * 5 * difficulty,
        health: 30 * difficulty,
        maxHealth: 30 * difficulty,
        damage: 5 * difficulty,
        speed: 1 + Math.random() * 2 * difficulty,
        color: `hsl(${Math.random() * HUE_RANGE}, ${SATURATION}%, ${BASE_LIGHTNESS - difficulty * DIFFICULTY_LIGHTNESS_REDUCTION}%)`,
      };

      enemiesRef.current.push(enemy);
    }
  };

  const strengthenAttack = () => {
    const player = playerRef.current;
    // Cost increases with each level: 50, 100, 150, 200, etc.
    const cost = 50 * (player.attackLevel + 1);
    
    if (player.bloodGauge >= cost) {
      player.bloodGauge -= cost;
      player.attackLevel += 1;
      player.attackDamage += 5; // Increase damage by 5 per level
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
    const healthPercent = Math.min(1, player.bloodGauge / 100); // Display relative to 100 for visual reference
    
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
            disabled={bloodGauge < 50 * (attackLevel + 1)}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold text-lg rounded-lg transition-colors shadow-lg"
          >
            攻撃力強化 (コスト: {50 * (attackLevel + 1)})
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
