const express = require('express');
const path = require("path");
const bcrypt = require("bcrypt");
const collection = require("./config"); // Your User model (LoginSchema)
const http = require('http');
const { Server } = require("socket.io");
const Character = require('./models/Character'); // Import the Character model
const Skill = require('./models/Skill'); // NOVO: Import the Skill model
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

const ChatMessage = require('./models/ChatMessage'); // Import ChatMessage model

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
            const newUser = await collection.create(data);
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

        // Authentication successful, store user ID in session
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
            return res.redirect('/home');
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

        const existingCharacterForUser = await Character.findOne({ owner: req.session.userId, name: name });
        if (existingCharacterForUser) {
            return res.status(409).json({ success: false, message: "You already have a character with this name. Choose another." });
        }

        const newCharacter = new Character({
            name: name,
            owner: req.session.userId,
            type: type,
            gender: gender,
            class: characterClass,
            // Default values for level, experience, stats, hp, maxHp, learnedSkills, activeSkills, skillCooldowns, equippedItems, inventory, activeBuffs
            // will be set by the schema defaults.
        });

        await newCharacter.save();

        user.characters.push(newCharacter._id);
        await user.save();

        return res.status(200).json({ success: true, message: "Character created successfully!", redirectTo: '/select-character' });

    } catch (error) {
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
        const user = await collection.findById(req.session.userId).populate('characters');
        if (!user) {
            return res.redirect('/');
        }

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
        if (!user || !user.characters.includes(characterId)) {
            return res.status(403).json({ success: false, message: "Invalid character or character does not belong to this user." });
        }

        req.session.activeCharacterId = characterId;
        req.session.battle = null;
        req.session.inventoryOpen = null;
        req.session.skillsOpen = null; // NOVO: Limpa o estado da seção de habilidades

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
        // NOVO: Popula learnedSkills e activeSkills para o frontend
        const activeCharacter = await Character.findById(req.session.activeCharacterId)
            .populate('learnedSkills')
            .populate('activeSkills');

        if (!user || !activeCharacter) {
            console.warn("User or active character not found in session. Redirecting to login.");
            req.session.destroy(() => {
                res.redirect('/');
            });
            return;
        }

        // NOVO: Busca todas as habilidades para exibir as disponíveis
        const allSkills = await Skill.find({});

        res.render("home", {
            userName: user.name,
            character: activeCharacter,
            allSkills: allSkills, // NOVO: Todas as habilidades para o frontend
            battleState: req.session.battle || null,
            inventoryState: req.session.inventoryOpen || null,
            skillsState: req.session.skillsOpen || null // NOVO: Estado da seção de habilidades
        });
    } catch (error) {
        console.error("Error loading home page:", error);
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
        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        if (!activeCharacter) {
            return res.redirect('/select-character');
        }

        req.session.battle = {
            playerHP: activeCharacter.hp,
            enemyHP: 50,
            enemyName: "Orc Pirata",
            enemyLevel: 1,
            battleLog: ["A batalha contra o Orc Pirata começou!"],
            status: "active"
        };
        req.session.inventoryOpen = null;
        req.session.skillsOpen = null; // NOVO: Garante que a seção de habilidades não esteja aberta
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

        const playerDamage = Math.max(1, activeCharacter.stats.attack - (battle.enemyLevel * 2));
        const enemyDamage = Math.max(1, (battle.enemyLevel * 5) - (activeCharacter.stats.defense / 2));

        battle.enemyHP -= playerDamage;
        battle.battleLog.push(`Você (${activeCharacter.name}) atacou o ${battle.enemyName} e causou ${playerDamage} de dano.`);

        if (battle.enemyHP <= 0) {
            battle.enemyHP = 0;
            battle.status = "win";
            battle.battleLog.push(`Você derrotou o ${battle.enemyName}!`);

            const expGained = 50;
            activeCharacter.experience += expGained;
            battle.battleLog.push(`Você ganhou ${expGained} pontos de experiência.`);

            let leveledUp = false;
            while (activeCharacter.experience >= (activeCharacter.level * 100)) {
                activeCharacter.experience -= (activeCharacter.level * 100);
                activeCharacter.level += 1;
                activeCharacter.skillPoints += 4;
                activeCharacter.maxHp += 20;
                activeCharacter.hp = activeCharacter.maxHp;
                battle.battleLog.push(`Parabéns! ${activeCharacter.name} alcançou o Nível ${activeCharacter.level}!`);
                battle.battleLog.push(`Você ganhou 4 pontos de status para distribuir.`);
                leveledUp = true;
            }

            const droppedItem = "Moeda de Ouro";
            activeCharacter.inventory.push({ item: droppedItem, quantity: 1 });

            battle.battleLog.push(`Você encontrou uma ${droppedItem}!`);

            await activeCharacter.save();

            return res.json({
                message: "Vitória!",
                battleState: battle,
                character: activeCharacter // Return the updated character object
            });
        }

        activeCharacter.hp -= enemyDamage;
        battle.battleLog.push(`${battle.enemyName} atacou você e causou ${enemyDamage} de dano.`);

        if (activeCharacter.hp <= 0) {
            activeCharacter.hp = 0;
            battle.playerHP = 0;
            battle.status = "lose";
            battle.battleLog.push(`Você foi derrotado pelo ${battle.enemyName}...`);

            await activeCharacter.save();

            return res.json({
                message: "Derrota!",
                battleState: battle,
                character: activeCharacter // Return the updated character object
            });
        }

        await activeCharacter.save();
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
    req.session.battle = null;
    req.session.skillsOpen = null; // NOVO: Garante que a seção de habilidades não esteja aberta
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

        activeCharacter.inventory = inventory.map(item => ({ item: item.item, quantity: item.quantity }));

        await activeCharacter.save();

        res.json({ success: true, message: "Inventário atualizado com sucesso!", characterInventory: activeCharacter.inventory });
    } catch (error) {
        console.error("Erro ao atualizar inventário:", error);
        res.status(500).json({ success: false, message: "Erro interno ao atualizar inventário." });
    }
});

// ----------------------------------------------------------------------
// NOVAS ROTAS DE HABILIDADES
// ----------------------------------------------------------------------

// Rota para exibir a seção de habilidades
app.get("/skills/show", isAuthenticatedAndCharacterSelected, async (req, res) => {
    console.log("Rota /skills/show acessada.");
    req.session.skillsOpen = true;
    req.session.battle = null; // Garante que a batalha não está ativa
    req.session.inventoryOpen = null; // Garante que o inventário não está aberto
    res.redirect("/home");
});

// Rota para esconder a seção de habilidades
app.get("/skills/hide", isAuthenticatedAndCharacterSelected, (req, res) => {
    console.log("Rota /skills/hide acessada.");
    req.session.skillsOpen = null;
    res.redirect("/home");
});

// Rota para o personagem aprender uma habilidade
app.post("/skills/learn", isAuthenticatedAndCharacterSelected, async (req, res) => {
    const { skillId } = req.body;

    try {
        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        const skillToLearn = await Skill.findById(skillId);

        if (!activeCharacter || !skillToLearn) {
            return res.status(404).json({ success: false, message: "Personagem ou habilidade não encontrados." });
        }

        // Verifica se a habilidade já foi aprendida
        if (activeCharacter.learnedSkills.includes(skillId)) {
            return res.status(400).json({ success: false, message: "Você já aprendeu esta habilidade." });
        }

        // Verifica se a classe do personagem pode aprender esta habilidade
        if (!skillToLearn.class.includes(activeCharacter.class)) {
            return res.status(403).json({ success: false, message: "Sua classe não pode aprender esta habilidade." });
        }

        // Verifica o nível requerido
        if (activeCharacter.level < skillToLearn.requiredLevel) {
            return res.status(400).json({ success: false, message: `Nível ${skillToLearn.requiredLevel} necessário para aprender esta habilidade.` });
        }

        // Adiciona a habilidade às habilidades aprendidas do personagem
        activeCharacter.learnedSkills.push(skillId);
        await activeCharacter.save();

        // Retorna o personagem atualizado para o frontend
        const updatedCharacter = await Character.findById(req.session.activeCharacterId)
            .populate('learnedSkills')
            .populate('activeSkills');

        return res.status(200).json({ success: true, message: `Habilidade "${skillToLearn.name}" aprendida!`, character: updatedCharacter });

    } catch (error) {
        console.error("Erro ao aprender habilidade:", error);
        res.status(500).json({ success: false, message: "Erro interno ao aprender habilidade." });
    }
});

// Rota para definir habilidades ativas
app.post("/skills/set-active", isAuthenticatedAndCharacterSelected, async (req, res) => {
    const { skillId, slotIndex } = req.body;

    try {
        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        const skillToAdd = await Skill.findById(skillId);

        if (!activeCharacter || !skillToAdd) {
            return res.status(404).json({ success: false, message: "Personagem ou habilidade não encontrados." });
        }

        // Verifica se a habilidade foi aprendida
        if (!activeCharacter.learnedSkills.includes(skillId)) {
            return res.status(400).json({ success: false, message: "Você não aprendeu esta habilidade." });
        }

        // Verifica se a habilidade já está ativa
        if (activeCharacter.activeSkills.includes(skillId)) {
            return res.status(400).json({ success: false, message: "Esta habilidade já está ativa." });
        }

        // Verifica o limite de habilidades ativas (2 slots)
        if (activeCharacter.activeSkills.length >= 2 && activeCharacter.activeSkills[slotIndex]) {
            // Se o slot já estiver ocupado, remove a habilidade antiga primeiro
            activeCharacter.activeSkills.splice(slotIndex, 1, skillId);
        } else if (activeCharacter.activeSkills.length < 2) {
            // Se ainda há espaço, adiciona ao array
            if (slotIndex !== undefined && slotIndex !== null && activeCharacter.activeSkills[slotIndex] === undefined) {
                 // Se um slot específico foi indicado e está vazio
                activeCharacter.activeSkills[slotIndex] = skillId;
            } else {
                // Adiciona ao próximo slot disponível
                activeCharacter.activeSkills.push(skillId);
            }
        } else {
            return res.status(400).json({ success: false, message: "Todos os slots de habilidades ativas estão ocupados." });
        }
        
        // Remove duplicatas caso a mesma skill seja adicionada acidentalmente em outro slot
        activeCharacter.activeSkills = [...new Set(activeCharacter.activeSkills.filter(s => s !== null && s !== undefined))];

        await activeCharacter.save();

        const updatedCharacter = await Character.findById(req.session.activeCharacterId)
            .populate('learnedSkills')
            .populate('activeSkills');

        return res.status(200).json({ success: true, message: `Habilidade "${skillToAdd.name}" definida como ativa!`, character: updatedCharacter });

    } catch (error) {
        console.error("Erro ao definir habilidade ativa:", error);
        res.status(500).json({ success: false, message: "Erro interno ao definir habilidade ativa." });
    }
});

// Rota para remover uma habilidade ativa
app.post("/skills/remove-active", isAuthenticatedAndCharacterSelected, async (req, res) => {
    const { skillId } = req.body;

    try {
        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        const skillToRemove = await Skill.findById(skillId);

        if (!activeCharacter || !skillToRemove) {
            return res.status(404).json({ success: false, message: "Personagem ou habilidade não encontrados." });
        }

        // Remove a habilidade do array de habilidades ativas
        const initialLength = activeCharacter.activeSkills.length;
        activeCharacter.activeSkills = activeCharacter.activeSkills.filter(id => id.toString() !== skillId);

        if (activeCharacter.activeSkills.length === initialLength) {
            return res.status(400).json({ success: false, message: "Esta habilidade não estava ativa." });
        }

        await activeCharacter.save();

        const updatedCharacter = await Character.findById(req.session.activeCharacterId)
            .populate('learnedSkills')
            .populate('activeSkills');

        return res.status(200).json({ success: true, message: `Habilidade "${skillToRemove.name}" removida das ativas!`, character: updatedCharacter });

    } catch (error) {
        console.error("Erro ao remover habilidade ativa:", error);
        res.status(500).json({ success: false, message: "Erro interno ao remover habilidade ativa." });
    }
});


// ----------------------------------------------------------------------
// Lógica do Socket.IO
// ----------------------------------------------------------------------
io.on('connection', async (socket) => {
    console.log('Um usuário conectado ao chat:', socket.id);

    // Carregar histórico de mensagens ao conectar
    try {
        const messages = await ChatMessage.find()
                                        .sort({ timestamp: 1 })
                                        .limit(50);

        messages.forEach(chatMsg => {
            socket.emit('chat message', `${chatMsg.sender}: ${chatMsg.message}`);
        });
        console.log(`Histórico de ${messages.length} mensagens carregado para ${socket.id}`);

    } catch (error) {
        console.error("Erro ao carregar histórico de mensagens:", error);
    }

    // Escuta por mensagens de chat de um cliente
    socket.on('chat message', async (fullMsg) => {
        console.log('Mensagem recebida do cliente:', fullMsg);

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
            console.log('Mensagem salva no banco de dados:', newChatMessage);

            io.emit('chat message', fullMsg);

        } catch (error) {
            console.error("Erro ao salvar mensagem no banco de dados:", error);
            socket.emit('chat error', 'Erro ao enviar mensagem.');
        }
    });

    // Quando um cliente se desconecta
    socket.on('disconnect', () => {
        console.log('Um usuário desconectado do chat:', socket.id);
    });
});
// --- Fim da Lógica do Socket.IO ---


// ----------------------------------------------------------------------
// SERVER CONFIGURATION (Listen)
// ----------------------------------------------------------------------

const port = process.env.PORT || 5000;
server.listen(port, () => {
    console.log(`Server running on port: ${port}`);
});
