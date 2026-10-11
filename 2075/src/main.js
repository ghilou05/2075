import './style.css';
import { createArena, createEnemy } from './enemy.js';

const arena = createArena(document.getElementById('stage'));
createEnemy(arena);