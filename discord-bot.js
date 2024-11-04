// Import required modules
const { Client, GatewayIntentBits, Partials } = require('discord.js');
require('dotenv').config();
const Database = require('better-sqlite3');

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

// Initialize SQLite database
const db = new Database('leaderboard.db');

// Create leaderboard table if it doesn’t exist
db.prepare(`
    CREATE TABLE IF NOT EXISTS leaderboard (
        userId TEXT PRIMARY KEY,
        username TEXT,
        wins INTEGER
    )
`).run();

const games = {};

// Start a new game between two players
function startGame(player1, player2, channel) {
    games[channel.id] = {
        player1,
        player2,
        scores: { [player1.id]: 0, [player2.id]: 0 },
        round: 1,
        choices: {},
        channel
    };

    channel.send(`Game started between ${player1.username} and ${player2.username}! Moves should be sent in DMs.`);
    [player1, player2].forEach(player =>
        player.send("Game started! Send your move (`!rock`, `!paper`, or `!scissors`) here in DMs.")
    );

    updateScore(channel);
    updateRound(channel);
}

// Update and display the current score
function updateScore(channel) {
    const game = games[channel.id];
    const { player1, player2, scores } = game;
    channel.send(`Score: ${player1.username} ${scores[player1.id]} - ${scores[player2.id]} ${player2.username}`);
}

// Update and display the current round
function updateRound(channel) {
    const game = games[channel.id];
    channel.send(`Round ${game.round}`);
}

// Handle player moves and determine round results
function handleChoice(player, choice, game) {
    game.choices[player.id] = choice;

    if (Object.keys(game.choices).length === 2) {
        const { player1, player2, choices, scores, channel } = game;
        const [p1Choice, p2Choice] = [choices[player1.id], choices[player2.id]];
        let roundResult;

        if (p1Choice === p2Choice) {
            roundResult = "It's a tie!";
        } else if ((p1Choice === 'rock' && p2Choice === 'scissors') ||
                   (p1Choice === 'scissors' && p2Choice === 'paper') ||
                   (p1Choice === 'paper' && p2Choice === 'rock')) {
            scores[player1.id]++;
            roundResult = `${player1.username} wins this round!`;
        } else {
            scores[player2.id]++;
            roundResult = `${player2.username} wins this round!`;
        }

        channel.send(roundResult);
        resetRound(game);

        updateScore(channel);
        checkGameEnd(game);
    }
}

// Reset choices and proceed to the next round
function resetRound(game) {
    game.choices = {};
    game.round++;
    updateRound(game.channel);
}

// Check if the game has ended and declare a winner
function checkGameEnd(game) {
    const { player1, player2, scores, channel } = game;
    const maxScore = 3;

    if (scores[player1.id] === maxScore || scores[player2.id] === maxScore) {
        const winner = scores[player1.id] === maxScore ? player1 : player2;

        incrementWin(winner.id, winner.username);
        channel.send(`Congratulations ${winner.username}, you won the game!`);
        delete games[channel.id];
    }
}

// Increment win count for the winner in the leaderboard
function incrementWin(userId, username) {
    const user = db.prepare("SELECT * FROM leaderboard WHERE userId = ?").get(userId);

    if (user) {
        db.prepare("UPDATE leaderboard SET wins = wins + 1 WHERE userId = ?").run(userId);
    } else {
        db.prepare("INSERT INTO leaderboard (userId, username, wins) VALUES (?, ?, 1)").run(userId, username);
    }
}

// Display the leaderboard
function displayLeaderboard(channel) {
    const leaderboard = db.prepare("SELECT * FROM leaderboard ORDER BY wins DESC LIMIT 10").all();
    const leaderboardMessage = leaderboard.length
        ? `🏆 **Leaderboard** 🏆\n${leaderboard.map((entry, index) => `${index + 1}. ${entry.username} - ${entry.wins} wins`).join('\n')}`
        : "The leaderboard is empty.";

    channel.send(leaderboardMessage);
}

// Message event listener for commands and moves
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Start game command in a guild text channel
    if (message.content.startsWith('!start') && message.channel.type === 0) {
        const players = [...message.mentions.users.values()];
        if (players.length < 2) return message.reply('You need to mention two players to start a game.');
        startGame(players[0], players[1], message.channel);
    }

    // Handle moves in DMs
    if (message.channel.type === 1) {
        const game = Object.values(games).find(g => g.player1.id === message.author.id || g.player2.id === message.author.id);
        if (!game) return message.reply("You're not currently in a game. Start a new game in a server channel with `!start @player1 @player2`.");

        const choice = message.content.slice(1).toLowerCase();
        if (['rock', 'paper', 'scissors'].includes(choice)) {
            handleChoice(message.author, choice, game);
        } else {
            message.reply("Invalid move. Use `!rock`, `!paper`, or `!scissors` to play.");
        }
    }

    // Reset game command in a guild text channel
    if (message.content.startsWith('!reset') && message.channel.type === 0) {
        if (games[message.channel.id]) {
            delete games[message.channel.id];
            message.channel.send("Game has been reset!");
        } else {
            message.reply("No game to reset in this channel.");
        }
    }

    // Leaderboard command in a guild text channel
    if (message.content.startsWith('!leaderboard') && message.channel.type === 0) {
        displayLeaderboard(message.channel);
    }
});

// Bot is ready
client.once('ready', () => {
    console.log('Bot is online!');
});

client.login(process.env.BOT_TOKEN);
