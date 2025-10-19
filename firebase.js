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

// Elements
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const signUpBtn = document.getElementById('signup');
const signInBtn = document.getElementById('signin');
const logoutBtn = document.getElementById('logout');
const userList = document.getElementById('user-list');

signUpBtn.onclick = async () => {
  await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value).catch(e => alert(e.message));
};

signInBtn.onclick = async () => {
  await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value).catch(e => alert(e.message));
};

logoutBtn.onclick = async () => {
  if(currentUser){
    await remove(ref(db, 'presence/' + currentUser.uid)); // Remove presence on logout
  }
  await signOut(auth);
};

let currentUser = null;
let currentGameId = null;

// On auth state changed
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if(user) {
    // Register presence
    const presRef = ref(db, 'presence/' + user.uid);
    set(presRef, { email: user.email, status: 'online' });
    onDisconnect(presRef).remove();

    listenOnlineUsers();
    // Clear or prepare UI/game for user
  } else {
    // Clear UI on logout
    userList.innerHTML = '';
    currentGameId = null;
  }
});

// Show online users except self and enable challenge
async function listenOnlineUsers() {
  onValue(ref(db, 'presence'), (snapshot) => {
    userList.innerHTML = '';
    snapshot.forEach(childSnap => {
      const uid = childSnap.key;
      const data = childSnap.val();
      if(uid !== currentUser.uid && data.status === 'online'){
        const li = document.createElement('li');
        li.textContent = data.email;
        li.style.cursor = 'pointer';
        li.style.color = 'green'; // green dot style could be better with CSS
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

// Create or join game with opponent
async function createOrJoinGame(opponentUid, opponentEmail) {
  if(!currentUser) return alert("Login required to challenge");
  // Create unique gameId sorted by uid to avoid duplicates
  let gameId = [currentUser.uid, opponentUid].sort().join('_');
  currentGameId = gameId;

  const gameRef = ref(db, 'games/' + gameId);
  const gameSnap = await get(gameRef);

  if (!gameSnap.exists()) {
    // Initial chess board state and game info - adapt your own chess board array here.
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
  listenGame(gameId);
}

function listenGame(gameId){
  const gameRef = ref(db, 'games/' + gameId);
  onValue(gameRef, (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.val();

    board = data.board;
    whiteToMove = (data.turn === 'white');
    render();

    // You can show current turn, player info
  });
}

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

// Patch existing movePiece to push updates
const oldMovePiece = window.movePiece;
window.movePiece = function(from, to){
  oldMovePiece(from, to);
  pushMove(from, to);
};
