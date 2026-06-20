// Blackjack game state manager
const gameStates = new Map();
const inactivityTimers = new Map();
const INACTIVITY_MS = 15 * 60_000; // 15 minutes inactivity timeout

function getCardValue(card) {
  if (card === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card)) return 10;
  return Number(card);
}

function calculateHand(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const value = getCardValue(card);
    if (card === 'A') aces++;
    total += value;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function createGame(playerId) {
  const deck = [];
  const suits = ['♠', '♣', '♥', '♦'];
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  for (let i = 0; i < 4; i++) {
    for (const value of values) {
      deck.push(value);
    }
  }
  
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return {
    playerId,
    deck,
    playerCards: [deck.pop(), deck.pop()],
    dealerCards: [deck.pop(), deck.pop()],
    gameOver: false,
    result: null,
    startedAt: Date.now(),
    lastActivity: Date.now(),
  };
}

function getGameState(playerId) {
  const state = gameStates.get(playerId);
  if (!state) return state;
  // Auto-expire on inactivity
  if (state.lastActivity && (Date.now() - state.lastActivity) > INACTIVITY_MS) {
    deleteGameState(playerId);
    return undefined;
  }
  return state;
}

function setGameState(playerId, state) {
  state.lastActivity = Date.now();
  gameStates.set(playerId, state);
  // reset inactivity timer
  clearTimeout(inactivityTimers.get(playerId));
  const t = setTimeout(() => {
    // remove stale game
    deleteGameState(playerId);
  }, INACTIVITY_MS);
  inactivityTimers.set(playerId, t);
}

function deleteGameState(playerId) {
  gameStates.delete(playerId);
  const t = inactivityTimers.get(playerId);
  if (t) {
    clearTimeout(t);
    inactivityTimers.delete(playerId);
  }
}

function dealerPlay(state) {
  while (calculateHand(state.dealerCards) < 17) {
    state.dealerCards.push(state.deck.pop());
  }
}

function determineWinner(state) {
  const playerTotal = calculateHand(state.playerCards);
  const dealerTotal = calculateHand(state.dealerCards);

  if (playerTotal > 21) return 'player_bust';
  if (dealerTotal > 21) return 'dealer_bust';
  if (playerTotal > dealerTotal) return 'player_win';
  if (dealerTotal > playerTotal) return 'dealer_win';
  return 'push';
}

module.exports = {
  createGame,
  getGameState,
  setGameState,
  deleteGameState,
  calculateHand,
  dealerPlay,
  determineWinner,
};
