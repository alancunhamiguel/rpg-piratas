const express = require('express');
const path = require("path");
const bcrypt = require("bcrypt");
// Assuming 'config' is your User model (LoginSchema) and is in the same folder as index.js (e.g., src/)
const collection = require("./config"); // Your User model (LoginSchema)
const http = require('http');
const { Server } = require("socket.io");
const Character = require('./models/Character'); // Import the new Character model
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

const ChatMessage = require('./models/ChatMessage'); // Adjusted path for src/models/ChatMessage

const app = express();

// --- Database Connection ---
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('ERROR: The MONGODB_URI environment variable is not defined.');
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Database connection established!');
    })
    .catch(err => {
        console.error('Database Cannot Be Connected!', err);
        process.exit(1);
    });
// --- End of Database Connection ---

// Create the Node.js HTTP server using the Express app
const server = http.createServer(app);
const io = new Server(server);

// Convert data to json
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Configure path for static files (CSS, images, etc.)
app.use(express.static("public")); // Ensure your 'public' folder exists with CSS/JS files

// Configure express-session
app.use(session({
    secret: process.env.SESSION_SECRET || 'sd@sds#fgewrwe3223321Da', // Use an environment variable for this!
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: MONGODB_URI,
        ttl: 14 * 24 * 60 * 60, // 14 days
        autoRemove: 'interval',
        autoRemoveInterval: 10 // Remove expired sessions every 10 minutes
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 14 // 14 days
    }
}));

// Use ejs as view engine
app.set('view engine', 'ejs');


// ----------------------------------------------------------------------
// AUTHENTICATION AND CHARACTER VERIFICATION MIDDLEWARES
// ----------------------------------------------------------------------

// Middleware to check if the user is logged in
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        return next(); // User authenticated, continue to the next route
    }
    // Redirect to the login page if not authenticated
    res.redirect("/");
};

// Middleware to check if the user is logged in AND has a character selected
const isAuthenticatedAndCharacterSelected = async (req, res, next) => {
    if (req.session.userId && req.session.activeCharacterId) {
        return next();
    }
    // If not logged in, go to the root (login)
    if (!req.session.userId) {
        return res.redirect('/');
    }
    // If logged in, but no character selected, redirect to character selection
    // This is important to ensure the user selects a character before going to the home page
    return res.redirect('/select-character');
};


// ----------------------------------------------------------------------
// AUTHENTICATION AND REGISTRATION ROUTES
// ----------------------------------------------------------------------

// Route for the login/registration page (initial page)
app.get("/", (req, res) => {
    // If the user is already logged in, redirect to character selection
    // or to creation if they don't have any characters yet.
    if (req.session.userId) {
        return res.redirect("/select-character"); // New flow
    }
    res.render("login");
});

// Route for the signup page
app.get("/signup", (req, res) => {
    res.render("signup");
});

// Register User
app.post("/signup", async (req, res) => {
    const data = {
        name: req.body.username,
        password: req.body.password,
        // 'level' and 'inventory' were removed from the user model,
        // they now belong to the Character model.
        // The 'characters' array in the user model will be populated after character creation.
    };

    try {
        const existingUser = await collection.findOne({ name: data.name });
        if (existingUser) {
            return res.status(409).json({ success: false, message: "Try another Username. This one already exists :(" });
        } else {
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(data.password, saltRounds);
            data.password = hashedPassword;

            // Insert the new user (without characters yet)
            const newUser = await collection.create(data); // Use create to return the created document
            console.log("New user registered:", newUser.name);

            // Redirect to the character creation page after successful registration
            return res.status(200).json({ success: true, message: "User registered successfully!", redirectTo: '/create-character' });
        }
    } catch (error) {
        console.error("Error registering user:", error);
        return res.status(500).json({ success: false, message: "Error registering user. Please try again." });
    }
});

// User Login
app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await collection.findOne({ name: username });

        if (!user) {
            return res.json({ success: false, message: "Username not found." });
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.json({ success: false, message: "Incorrect password." });
        }

        // Successful authentication, store user ID in session
        req.session.userId = user._id;

        // Populate user's characters to check if they have any
        const userWithCharacters = await collection.findById(user._id).populate('characters');

        if (userWithCharacters.characters.length === 0) {
            // If no characters, redirect to character creation
            return res.json({ success: true, message: "Login successful! Create your first character.", redirectTo: '/create-character' });
        } else {
            // If characters exist, redirect to character selection
            return res.json({ success: true, message: "Login successful! Select your character.", redirectTo: '/select-character' });
        }

    } catch (error) {
        console.error("Error during login:", error);
        res.json({ success: false, message: "Internal server error during login." });
    }
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.redirect('/home'); // Or wherever you want in case of error
        }
        res.clearCookie('connect.sid'); // Clear the session cookie
        res.redirect('/'); // Redirect to the login page
    });
});


// ----------------------------------------------------------------------
// CHARACTER MANAGEMENT ROUTES
// ----------------------------------------------------------------------

// Route for the character creation page
app.get('/create-character', isAuthenticated, async (req, res) => {
    try {
        const user = await collection.findById(req.session.userId).populate('characters');
        if (!user) {
            return res.redirect('/'); // User not found, redirect to login
        }

        // If the user already has 2 characters, redirect to the selection screen
        if (user.characters.length >= 2) {
            return res.redirect('/select-character');
        }
        // If less than 2 characters, render the creation page
        res.render('create-character', { user: user });
    } catch (error) {
        console.error("Error loading character creation page:", error);
        res.redirect('/'); // In case of error, redirect to login
    }
});

// Route to process character creation
app.post('/create-character', isAuthenticated, async (req, res) => {
    const { name, type, gender, characterClass } = req.body;

    try {
        const user = await collection.findById(req.session.userId).populate('characters');
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        if (user.characters.length >= 2) {
            return res.status(400).json({ success: false, message: "You already have the maximum number of characters (2)." });
        }

        // Check if a character with this name already exists for THIS USER
        // The unique index on CharacterSchema.index({ owner: 1, name: 1 }, { unique: true }); already handles this,
        // but an explicit check here can provide a more user-friendly error message.
        const existingCharacterForUser = await Character.findOne({ owner: req.session.userId, name: name });
        if (existingCharacterForUser) {
            return res.status(409).json({ success: false, message: "You already have a character with this name. Choose another." });
        }

        // Create the new character
        const newCharacter = new Character({
            name: name,
            owner: req.session.userId,
            type: type,
            gender: gender,
            class: characterClass,
            // Other fields like level, experience, stats, hp, maxHp will have default values from the schema
        });

        await newCharacter.save();

        // Add the ID of the new character to the user's characters array
        user.characters.push(newCharacter._id);
        await user.save();

        // After creation, redirect to the character selection screen
        return res.status(200).json({ success: true, message: "Character created successfully!", redirectTo: '/select-character' });

    } catch (error) {
        // Mongoose ValidationError (e.g., invalid enum) or other DB error
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        console.error("Error creating character:", error);
        return res.status(500).json({ success: false, message: "Internal error creating character. Please try again." });
    }
});


// Route for the character selection page
app.get('/select-character', isAuthenticated, async (req, res) => {
    try {
        // Populate the user's characters to display them
        const user = await collection.findById(req.session.userId).populate('characters');
        if (!user) {
            return res.redirect('/');
        }

        // If the user has no characters, redirect to creation
        if (user.characters.length === 0) {
            return res.redirect('/create-character');
        }

        res.render('select-character', { characters: user.characters });
    } catch (error) {
        console.error("Error loading character selection:", error);
        res.redirect('/');
    }
});

// Route to process character selection
app.post('/select-character', isAuthenticated, async (req, res) => {
    const { characterId } = req.body;

    try {
        const user = await collection.findById(req.session.userId);
        // Ensure the character truly belongs to the logged-in user
        // Using `user.characters.some(char => char._id.equals(characterId))` is more robust if `characters` are object IDs directly.
        // If `characters` is just an array of strings, `includes` is fine.
        if (!user || !user.characters.includes(characterId)) {
            return res.status(403).json({ success: false, message: "Invalid character or character does not belong to this user." });
        }

        // Store the ID of the selected character in the session
        req.session.activeCharacterId = characterId;
        // Clear old battle and inventory data from the session, as they belong to the character
        req.session.battle = null;
        req.session.inventoryOpen = null;


        return res.status(200).json({ success: true, message: "Character selected!", redirectTo: '/home' });

    } catch (error) {
        console.error("Error selecting character:", error);
        return res.status(500).json({ success: false, message: "Internal error selecting character." });
    }
});


// ----------------------------------------------------------------------
// HOME ROUTE (REQUIRES ACTIVE CHARACTER)
// ----------------------------------------------------------------------

// Route for the main game page (Home)
app.get("/home", isAuthenticatedAndCharacterSelected, async (req, res) => {
    try {
        const user = await collection.findById(req.session.userId);
        const activeCharacter = await Character.findById(req.session.activeCharacterId);

        if (!user || !activeCharacter) {
            // If something goes wrong (user or character not found in session),
            // clear the session and redirect to login
            console.warn("User or active character not found in session. Redirecting to login.");
            req.session.destroy(() => {
                res.redirect('/');
            });
            return;
        }

        // Pass active character data to home
        res.render("home", {
            userName: user.name, // Username
            character: activeCharacter, // The complete active character object
            battleState: req.session.battle || null,
            inventoryState: req.session.inventoryOpen || null
        });
    } catch (error) {
        console.error("Error loading home page:", error);
        // In case of error, redirect to root (login)
        res.redirect('/');
    }
});

// ----------------------------------------------------------------------
// BATTLE AND INVENTORY ROUTES (ADJUSTED TO USE CHARACTER DATA)
// ----------------------------------------------------------------------

// Route to start/restart battle
app.get("/battle/start", isAuthenticatedAndCharacterSelected, async (req, res) => {
    console.log("Route /battle/start accessed.");
    try {
        // Retrieve the active character to get initial HP and other stats
        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        if (!activeCharacter) {
            return res.redirect('/select-character'); // Character not found, force selection
        }

        req.session.battle = {
            playerHP: activeCharacter.hp, // Use the character's current HP
            enemyHP: 50, // Default enemy HP (you'll want to load this from a real enemy model later)
            enemyName: "Orc Pirata",
            enemyLevel: 1,
            battleLog: ["A batalha contra o Orc Pirata começou!"],
            status: "active"
        };
        req.session.inventoryOpen = null;
        res.redirect("/home");
    } catch (error) {
        console.error("Erro ao iniciar batalha:", error);
        res.redirect('/home');
    }
});

// Route for the player to attack
app.post("/battle/attack", isAuthenticatedAndCharacterSelected, async (req, res) => {
    const battle = req.session.battle;

    if (!battle || battle.status !== "active") {
        return res.json({ message: "Nenhuma batalha ativa.", battleState: battle });
    }

    try {
        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        if (!activeCharacter) {
            return res.status(404).json({ message: "Personagem não encontrado.", battleState: battle });
        }

        // Use character stats to calculate damage
        const playerDamage = Math.max(1, activeCharacter.stats.attack - (battle.enemyLevel * 2)); // Simple calculation example
        const enemyDamage = Math.max(1, (battle.enemyLevel * 5) - (activeCharacter.stats.defense / 2)); // Example

        battle.enemyHP -= playerDamage;
        battle.battleLog.push(`Você (${activeCharacter.name}) atacou o ${battle.enemyName} e causou ${playerDamage} de dano.`);

        if (battle.enemyHP <= 0) {
            battle.enemyHP = 0;
            battle.status = "win";
            battle.battleLog.push(`Você derrotou o ${battle.enemyName}!`);

            // XP and Level Up Logic (after victory)
            const expGained = 50; // Example XP
            activeCharacter.experience += expGained;
            battle.battleLog.push(`Você ganhou ${expGained} pontos de experiência.`);

            // Leveling logic (you might have a function for this)
            let leveledUp = false;
            while (activeCharacter.experience >= (activeCharacter.level * 100)) { // Example: 100 XP per level
                activeCharacter.experience -= (activeCharacter.level * 100);
                activeCharacter.level += 1;
                activeCharacter.skillPoints += 4; // Gains 4 stat points per level
                activeCharacter.maxHp += 20; // Example: increases max HP per level
                activeCharacter.hp = activeCharacter.maxHp; // Full heal on level up
                battle.battleLog.push(`Parabéns! ${activeCharacter.name} alcançou o Nível ${activeCharacter.level}!`);
                battle.battleLog.push(`Você ganhou 4 pontos de status para distribuir.`);
                leveledUp = true;
            }

            // Item Drop Logic (simplified example)
            const droppedItem = "Moeda de Ouro";
            // Add the item to the CHARACTER's inventory (no longer directly to user in session)
            // The `findIndex` approach `activeCharacter.inventory.findIndex(invItem => invItem.item.toString() === droppedItem);`
            // is more appropriate if `invItem.item` is an ObjectId. Since it's currently a string,
            // a simple push `activeCharacter.inventory.push({ item: droppedItem, quantity: 1 });` is fine.
            // When you implement a proper Item model, you'll want to add the Item's `_id` and handle quantity updates.
            activeCharacter.inventory.push({ item: droppedItem, quantity: 1 }); // Simplified for now

            battle.battleLog.push(`Você encontrou uma ${droppedItem}!`);

            // Save updates to the CHARACTER
            await activeCharacter.save();

            return res.json({
                message: "Vitória!",
                battleState: battle,
                character: activeCharacter // Return the updated character object
            });
        }

        // Enemy's turn
        activeCharacter.hp -= enemyDamage; // Decrease CHARACTER's HP
        battle.battleLog.push(`${battle.enemyName} atacou você e causou ${enemyDamage} de dano.`);

        if (activeCharacter.hp <= 0) {
            activeCharacter.hp = 0;
            battle.playerHP = 0; // To synchronize display
            battle.status = "lose";
            battle.battleLog.push(`Você foi derrotado pelo ${battle.enemyName}...`);
            // When losing, perhaps reset the character's HP to 1 (to not be dead on screen)
            // or redirect to a game over screen. For now, it just sets to 0.

            await activeCharacter.save(); // Save the updated HP (0)

            return res.json({
                message: "Derrota!",
                battleState: battle,
                character: activeCharacter // Return the updated character object
            });
        }

        // If the battle continues, save the character's updated HP
        await activeCharacter.save();
        // Synchronize the session's playerHP with the character's real HP
        battle.playerHP = activeCharacter.hp;

        res.json({ message: "Turno concluído.", battleState: battle, character: activeCharacter });

    } catch (error) {
        console.error("Erro durante a batalha:", error);
        res.status(500).json({ success: false, message: "Erro interno durante a batalha." });
    }
});

// Route to reset the battle (return to home without active battle)
app.post("/battle/reset", isAuthenticatedAndCharacterSelected, (req, res) => {
    console.log("Route /battle/reset accessed.");
    req.session.battle = null;
    res.json({ message: "Batalha resetada." });
});

// Route to display inventory
app.get("/inventory/show", isAuthenticatedAndCharacterSelected, (req, res) => {
    console.log("Route /inventory/show accessed.");
    req.session.inventoryOpen = true;
    req.session.battle = null; // Ensure battle is not active when opening inventory
    res.redirect("/home");
});

// Route to hide inventory and return to home
app.get("/inventory/hide", isAuthenticatedAndCharacterSelected, (req, res) => {
    console.log("Route /inventory/hide accessed.");
    req.session.inventoryOpen = null;
    res.redirect("/home");
});

// Route to update user's inventory in the database (NOW CHARACTER'S)
app.post("/inventory/update", isAuthenticatedAndCharacterSelected, async (req, res) => {
    console.log("Route /inventory/update accessed.");
    try {
        let { inventory } = req.body;

        if (!Array.isArray(inventory)) {
            console.warn("Received non-array inventory from client. Resetting to empty array.");
            inventory = [];
        }

        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        if (!activeCharacter) {
            return res.status(404).json({ success: false, message: "Personagem não encontrado." });
        }

        // ATTENTION: If your frontend sends only item names, this part will need to be more robust
        // when you have a real Item model with IDs. For now, it just assigns.
        activeCharacter.inventory = inventory.map(item => ({ item: item.item, quantity: item.quantity })); // Assumes client sends { item: "name", quantity: X }

        await activeCharacter.save();

        res.json({ success: true, message: "Inventário atualizado com sucesso!", characterInventory: activeCharacter.inventory });
    } catch (error) {
        console.error("Erro ao atualizar inventário:", error);
        res.status(500).json({ success: false, message: "Erro interno ao atualizar inventário." });
    }
});


// ----------------------------------------------------------------------
// Socket.IO Logic (MODIFIED TO SAVE AND LOAD MESSAGES)
// ----------------------------------------------------------------------
io.on('connection', async (socket) => {
    console.log('A user connected to chat:', socket.id);

    // Load message history on connect
    try {
        const messages = await ChatMessage.find()
                                        .sort({ timestamp: 1 })
                                        .limit(50);

        messages.forEach(chatMsg => {
            socket.emit('chat message', `${chatMsg.sender}: ${chatMsg.message}`);
        });
        console.log(`History of ${messages.length} messages loaded for ${socket.id}`);

    } catch (error) {
        console.error("Error loading message history:", error);
    }

    // Listen for chat messages from a client
    socket.on('chat message', async (fullMsg) => {
        console.log('Message received from client:', fullMsg);

        const parts = fullMsg.split(': ');
        let sender = 'Desconhecido';
        let messageContent = fullMsg;

        if (parts.length > 1) {
            sender = parts[0];
            messageContent = parts.slice(1).join(': ');
        }

        try {
            const newChatMessage = new ChatMessage({
                sender: sender,
                message: messageContent
            });
            await newChatMessage.save();
            console.log('Message saved to database:', newChatMessage);

            io.emit('chat message', fullMsg);

        } catch (error) {
            console.error("Error saving message to database:", error);
            socket.emit('chat error', 'Error sending message.');
        }
    });

    // When a client disconnects
    socket.on('disconnect', () => {
        console.log('A user disconnected from chat:', socket.id);
    });
});
// --- End of Socket.IO Logic ---


// ----------------------------------------------------------------------
// SERVER CONFIGURATION (Listen)
// ----------------------------------------------------------------------

const port = process.env.PORT || 5000;
server.listen(port, () => {
    console.log(`Server running on port: ${port}`);
});