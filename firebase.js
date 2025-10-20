import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { 
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, update, onValue, onDisconnect, remove 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAh7spDeQk7nG0qzrXf2iA6vK2A2Cztyng",
  authDomain: "chessx-c94e2.firebaseapp.com",
  databaseURL: "https://chessx-c94e2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chessx-c94e2",
  storageBucket: "chessx-c94e2.firebasestorage.app",
  messagingSenderId: "881392331293",
  appId: "1:881392331293:web:39c747febf59e9321b34f4",
  measurementId: "G-J4V0NH3HC8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// DOM elements
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const signUpBtn = document.getElementById('signup');
const signInBtn = document.getElementById('signin');
const logoutBtn = document.getElementById('logout');
const userList = document.getElementById('user-list');

signUpBtn.onclick = async () => {
  try {
    await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
  } catch(e) {
    alert(e.message);
  }
};

signInBtn.onclick = async () => {
  try {
    await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
  } catch(e) {
    alert(e.message);
  }
};

logoutBtn.onclick = async () => {
  if(currentUser) {
    await remove(ref(db, 'presence/' + currentUser.uid));
  }
  await signOut(auth);
};

let currentUser = null;
let currentGameId = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if(user) {
    // Register presence
    const presRef = ref(db, 'presence/' + user.uid);
    set(presRef, { email: user.email, status: 'online' });
    onDisconnect(presRef).remove();

    listenOnlineUsers();
    listenIncomingChallenges();

  } else {
    userList.innerHTML = '';
    currentGameId = null;
  }
});


function listenOnlineUsers() {
  onValue(ref(db, 'presence'), (snapshot) => {
    userList.innerHTML = '';
    snapshot.forEach(childSnap => {
      const uid = childSnap.key;
      const data = childSnap.val();
      if(uid !== currentUser.uid && data.status === 'online'){
        const li = document.createElement('li');
        li.textContent = data.email + ' ';
        li.style.cursor = 'pointer';
        li.style.color = 'green';
        const greenDot = document.createElement('span');
        greenDot.textContent = '●';
        greenDot.style.color = 'green';
        greenDot.style.fontSize = '1.5em';
        li.appendChild(greenDot);
        li.onclick = () => {
          if(confirm(`Challenge ${data.email} to play?`)){
            createOrJoinGame(uid, data.email);
          }
        };
        userList.appendChild(li);
      }
    });
  });
}

// Send a challenge invitation
async function createOrJoinGame(opponentUid, opponentEmail) {
  if(!currentUser) return alert("Login required");

  const gameId = [currentUser.uid, opponentUid].sort().join('_');
  currentGameId = gameId;

  const gameRef = ref(db, 'games/' + gameId);
  const gameSnap = await get(gameRef);

  if(!gameSnap.exists()) {
    const initBoard = yourInitialBoardState(); 
    await set(gameRef, {
      players: { white: currentUser.uid, black: opponentUid },
      turn: 'white',
      board: initBoard,
      lastMove: null,
      status: 'live',
      lastUpdateBy: null
    });
  }

  listenGame(gameId); // ✅ call listener

  // Paste or define your listener here or inside listenGame()
  gameRef.on('value', (snapshot) => {
    const gameState = snapshot.val();
    if (!gameState) return;

    if (gameState.lastUpdateBy === currentUser.uid) return; // skip your own move

    board = gameState.board.slice();
    whiteToMove = (gameState.turn === 'white');
    lastFrom = gameState.lastMove?.from ?? null;
    lastTo = gameState.lastMove?.to ?? null;

    render();
    renderCapturedPanels();

    const myTurn = (whiteToMove && myPlayerColor === 'white') || (!whiteToMove && myPlayerColor === 'black');
    statusEl.textContent = myTurn ? "Your turn" : "Opponent's turn";
  });

  await set(ref(db, 'challenges/' + opponentUid), {
    from: currentUser.uid,
    email: currentUser.email,
    gameId: gameId,
    timestamp: Date.now()
  });
}


// Listen for incoming challenge requests
function listenIncomingChallenges() {
  const challengeRef = ref(db, 'challenges/' + currentUser.uid);
  onValue(challengeRef, (snap) => {
    if(snap.exists()) {
      const challenge = snap.val();
      if(confirm(`${challenge.email} challenged you to a game. Accept?`)){
        currentGameId = challenge.gameId;
        listenGame(currentGameId);
      }
      // Remove challenge after prompt
      remove(challengeRef);
    }
  });
}

// Listen for game state changes and update UI
let playerColor = null;

function listenGame(gameId){
  const gameRef = ref(db, 'games/' + gameId);

  onValue(gameRef, (snap) => {
    if(!snap.exists()) return;
    const data = snap.val();

    // Always update local board from Firebase (first load + moves)
    board = Array.isArray(data.board) ? data.board.slice() : board;
    whiteToMove = (data.turn === 'white');
    canCastleWK = !!data.canCastleWK;
    canCastleWQ = !!data.canCastleWQ;
    canCastleBK = !!data.canCastleBK;
    canCastleBQ = !!data.canCastleBQ;
    enPassantTarget = data.enPassantTarget ?? null;
    lastFrom = data.lastFrom ?? null;
    lastTo = data.lastTo ?? null;
    kingInCheckIndex = data.kingInCheckIndex ?? null;
    capturedByWhite = data.capturedByWhite ?? [];
    capturedByBlack = data.capturedByBlack ?? [];
    moveLog = data.moveLog ?? [];

    // Identify this user's color
    if (currentUser && data.players) {
      if (currentUser.uid === data.players.white) playerColor = 'white';
      else if (currentUser.uid === data.players.black) playerColor = 'black';
    }

    // Render board and trays after updating
    render();
    renderCapturedPanels();

    // Show turn info
    const myTurn = (whiteToMove && playerColor === 'white') || (!whiteToMove && playerColor === 'black');
    statusEl.textContent = myTurn ? "Your turn" : "Opponent's turn";
  });
}



// Push move updates to DB
async function pushMove(from, to){
  if(!currentGameId) return;
  const gameRef = ref(db, 'games/' + currentGameId);
  await update(gameRef, {
    board,
    turn: whiteToMove ? 'white' : 'black',
    lastMove: { from, to, at: Date.now() },
    lastUpdateBy: currentUser.uid
  });
}

// Wrap existing movePiece to push changes
const oldMovePiece = window.movePiece;
window.movePiece = function(from, to){
  // Prevent moves if it’s not this player’s turn
  if ((whiteToMove && playerColor !== 'white') || (!whiteToMove && playerColor !== 'black')) {
    alert("It's not your turn!");
    return;
  }

  oldMovePiece(from, to);
  pushMove(from, to);
};
