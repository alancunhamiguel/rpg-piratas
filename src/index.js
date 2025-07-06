const express = require('express');
const path = require("path");
const bcrypt = require("bcrypt");
const collection = require("./config"); // Your User model (LoginSchema)
const http = require('http');
const { Server } = require("socket.io");
const Character = require('./models/Character'); // Import the Character model
const Skill = require('./models/Skill'); // Import the Skill model
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

        // Add "Atacar" and "Defender" as default learned skills for new characters
        const defaultAttackSkill = await Skill.findOne({ name: "Atacar", class: characterClass, requiredLevel: 1 });
        const defaultDefenseSkill = await Skill.findOne({ name: "Defender", class: characterClass, requiredLevel: 1 });

        if (defaultAttackSkill) {
            newCharacter.learnedSkills.push(defaultAttackSkill._id);
        }
        if (defaultDefenseSkill) {
            newCharacter.learnedSkills.push(defaultDefenseSkill._id);
        }

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
        req.session.skillsOpen = null; // Clears the skill section state

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
        // Populate learnedSkills and activeSkills for the frontend
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

        // Fetch all skills to display available ones
        const allSkills = await Skill.find({});

        res.render("home", {
            userName: user.name,
            character: activeCharacter,
            allSkills: allSkills, // All skills for the frontend
            battleState: req.session.battle || null,
            inventoryState: req.session.inventoryOpen || null,
            skillsState: req.session.skillsOpen || null // Skill section state
        });
    } catch (error) {
        console.error("Error loading home page:", error);
        res.redirect('/');
    }
});

// ----------------------------------------------------------------------
// BATTLE AND INVENTORY ROUTES (ADJUSTED TO USE CHARACTER DATA)
// ----------------------------------------------------------------------

// Helper function to apply skill effects
const applySkillEffect = (skill, character, enemy, battleLog) => {
    let message = '';
    switch (skill.effect.type) {
        case 'damage':
            // Base damage + character attack stat * skill value multiplier (example)
            const damageDealt = Math.max(1, skill.effect.value + (character.stats.attack * 0.5));
            enemy.hp -= damageDealt;
            message = `${character.name} usou ${skill.name} e causou ${damageDealt.toFixed(0)} de dano ao ${enemy.name}.`;
            break;
        case 'buff':
            // Check if buff already exists, update duration if it's the same buff
            const existingBuffIndex = character.activeBuffs.findIndex(b => b.name === skill.name && b.stat === skill.effect.stat);
            if (existingBuffIndex !== -1) {
                character.activeBuffs[existingBuffIndex].turnsRemaining = skill.effect.duration;
                message = `${character.name} renovou o efeito de ${skill.name}!`;
            } else {
                character.activeBuffs.push({
                    name: skill.name,
                    stat: skill.effect.stat,
                    value: skill.effect.value,
                    duration: skill.effect.duration,
                    turnsRemaining: skill.effect.duration
                });
                message = `${character.name} usou ${skill.name}! ${skill.effect.message}`;
            }
            break;
        case 'heal':
            const healAmount = skill.effect.value;
            character.hp = Math.min(character.maxHp, character.hp + healAmount);
            message = `${character.name} usou ${skill.name} e recuperou ${healAmount} de HP.`;
            break;
        // Add more effect types as needed (e.g., debuff, stun)
        default:
            message = `${skill.name} foi usado, mas não teve efeito conhecido.`;
            break;
    }
    battleLog.push(message);
};

// Helper function to manage turn-based effects (buffs and cooldowns)
const manageTurnEffects = (character, battleLog) => {
    // Decrement active buff durations
    character.activeBuffs = character.activeBuffs.filter(buff => {
        buff.turnsRemaining--;
        if (buff.turnsRemaining <= 0) {
            battleLog.push(`${buff.name} de ${character.name} expirou.`);
            return false; // Remove expired buff
        }
        return true; // Keep active buff
    });

    // Decrement skill cooldowns
    character.skillCooldowns = character.skillCooldowns.filter(cooldown => {
        cooldown.turnsRemaining--;
        if (cooldown.turnsRemaining <= 0) {
            battleLog.push(`Habilidade ${cooldown.skill.name} de ${character.name} saiu do cooldown.`);
            return false; // Remove expired cooldown
        }
        return true; // Keep active cooldown
    });
};


// Route to start/restart battle
app.get("/battle/start", isAuthenticatedAndCharacterSelected, async (req, res) => {
    console.log("Route /battle/start accessed.");
    try {
        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        if (!activeCharacter) {
            return res.redirect('/select-character');
        }

        // Reset character's HP to maxHp when starting a new battle (or to a fixed value)
        activeCharacter.hp = activeCharacter.maxHp;
        activeCharacter.activeBuffs = []; // Clear buffs
        activeCharacter.skillCooldowns = []; // Clear cooldowns
        await activeCharacter.save(); // Save the reset character state

        req.session.battle = {
            playerHP: activeCharacter.hp,
            enemyHP: 50, // Fixed enemy HP for now
            enemyName: "Orc Pirata",
            enemyLevel: 1,
            battleLog: ["A batalha contra o Orc Pirata começou!"],
            status: "active"
        };
        req.session.inventoryOpen = null;
        req.session.skillsOpen = null;
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
        const activeCharacter = await Character.findById(req.session.activeCharacterId)
            .populate('activeSkills') // Populate active skills to use their data
            .populate('skillCooldowns.skill'); // Populate the skill object within cooldowns

        if (!activeCharacter) {
            return res.status(404).json({ message: "Personagem não encontrado.", battleState: battle });
        }

        // --- Player's Turn: Basic Attack ---
        // Calculate player's effective attack considering buffs
        let effectivePlayerAttack = activeCharacter.stats.attack;
        activeCharacter.activeBuffs.forEach(buff => {
            if (buff.stat === 'attack') {
                effectivePlayerAttack += activeCharacter.stats.attack * buff.value;
            }
        });
        const playerDamage = Math.max(1, effectivePlayerAttack - (battle.enemyLevel * 2));

        battle.enemyHP -= playerDamage;
        battle.battleLog.push(`Você (${activeCharacter.name}) atacou o ${battle.enemyName} e causou ${playerDamage.toFixed(0)} de dano.`);

        // --- Check for Battle End (Player Win) ---
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

            // Add default skills if new level unlocks them (example, you'd refine this)
            const newSkillsForLevel = await Skill.find({
                class: activeCharacter.class,
                requiredLevel: activeCharacter.level,
                _id: { $nin: activeCharacter.learnedSkills } // Only skills not yet learned
            });
            newSkillsForLevel.forEach(newSkill => {
                activeCharacter.learnedSkills.push(newSkill._id);
                battle.battleLog.push(`Você aprendeu uma nova habilidade: ${newSkill.name}!`);
            });


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

        // --- Manage Turn Effects (Buffs and Cooldowns) ---
        manageTurnEffects(activeCharacter, battle.battleLog);

        // --- Enemy's Turn ---
        // Calculate enemy's effective damage considering character's defense buffs
        let effectiveCharacterDefense = activeCharacter.stats.defense;
        activeCharacter.activeBuffs.forEach(buff => {
            if (buff.stat === 'defense') {
                effectiveCharacterDefense += activeCharacter.stats.defense * buff.value;
            }
        });
        const enemyDamage = Math.max(1, (battle.enemyLevel * 5) - (effectiveCharacterDefense / 2));

        activeCharacter.hp -= enemyDamage;
        battle.battleLog.push(`${battle.enemyName} atacou você e causou ${enemyDamage.toFixed(0)} de dano.`);

        // --- Check for Battle End (Player Lose) ---
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

// NOVO: Rota para usar uma habilidade na batalha
app.post("/battle/use-skill", isAuthenticatedAndCharacterSelected, async (req, res) => {
    const { skillId } = req.body;
    const battle = req.session.battle;

    if (!battle || battle.status !== "active") {
        return res.json({ success: false, message: "Nenhuma batalha ativa.", battleState: battle });
    }

    try {
        const activeCharacter = await Character.findById(req.session.activeCharacterId)
            .populate('activeSkills') // Ensure active skills are populated
            .populate('skillCooldowns.skill'); // Populate skill objects within cooldowns

        if (!activeCharacter) {
            return res.status(404).json({ success: false, message: "Personagem não encontrado." });
        }

        const skillToUse = activeCharacter.activeSkills.find(s => s._id.toString() === skillId);
        if (!skillToUse) {
            return res.status(400).json({ success: false, message: "Habilidade não ativa ou não encontrada." });
        }

        // Check cooldown
        const skillOnCooldown = activeCharacter.skillCooldowns.find(c => c.skill._id.toString() === skillId);
        if (skillOnCooldown && skillOnCooldown.turnsRemaining > 0) {
            return res.status(400).json({ success: false, message: `Habilidade "${skillToUse.name}" está em cooldown por ${skillOnCooldown.turnsRemaining} turnos.` });
        }

        // Apply skill effect
        applySkillEffect(skillToUse, activeCharacter, battle, battle.battleLog);

        // Put skill on cooldown
        if (skillToUse.cooldown > 0) {
            const existingCooldownIndex = activeCharacter.skillCooldowns.findIndex(c => c.skill._id.toString() === skillId);
            if (existingCooldownIndex !== -1) {
                activeCharacter.skillCooldowns[existingCooldownIndex].turnsRemaining = skillToUse.cooldown;
            } else {
                activeCharacter.skillCooldowns.push({ skill: skillToUse._id, turnsRemaining: skillToUse.cooldown });
            }
            battle.battleLog.push(`Habilidade "${skillToUse.name}" entrou em cooldown por ${skillToUse.cooldown} turnos.`);
        }

        // --- Check for Battle End (Player Win) after skill use ---
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

            // Add default skills if new level unlocks them (example, you'd refine this)
            const newSkillsForLevel = await Skill.find({
                class: activeCharacter.class,
                requiredLevel: activeCharacter.level,
                _id: { $nin: activeCharacter.learnedSkills } // Only skills not yet learned
            });
            newSkillsForLevel.forEach(newSkill => {
                activeCharacter.learnedSkills.push(newSkill._id);
                battle.battleLog.push(`Você aprendeu uma nova habilidade: ${newSkill.name}!`);
            });


            const droppedItem = "Moeda de Ouro";
            activeCharacter.inventory.push({ item: droppedItem, quantity: 1 });
            battle.battleLog.push(`Você encontrou uma ${droppedItem}!`);

            await activeCharacter.save();

            return res.json({
                success: true,
                message: "Vitória!",
                battleState: battle,
                character: activeCharacter
            });
        }

        // --- Manage Turn Effects (Buffs and Cooldowns) ---
        manageTurnEffects(activeCharacter, battle.battleLog);

        // --- Enemy's Turn ---
        let effectiveCharacterDefense = activeCharacter.stats.defense;
        activeCharacter.activeBuffs.forEach(buff => {
            if (buff.stat === 'defense') {
                effectiveCharacterDefense += activeCharacter.stats.defense * buff.value;
            }
        });
        const enemyDamage = Math.max(1, (battle.enemyLevel * 5) - (effectiveCharacterDefense / 2));

        activeCharacter.hp -= enemyDamage;
        battle.battleLog.push(`${battle.enemyName} atacou você e causou ${enemyDamage.toFixed(0)} de dano.`);

        // --- Check for Battle End (Player Lose) ---
        if (activeCharacter.hp <= 0) {
            activeCharacter.hp = 0;
            battle.playerHP = 0;
            battle.status = "lose";
            battle.battleLog.push(`Você foi derrotado pelo ${battle.enemyName}...`);

            await activeCharacter.save();

            return res.json({
                success: true,
                message: "Derrota!",
                battleState: battle,
                character: activeCharacter
            });
        }

        await activeCharacter.save();
        battle.playerHP = activeCharacter.hp;

        res.json({ success: true, message: "Habilidade usada. Turno concluído.", battleState: battle, character: activeCharacter });

    } catch (error) {
        console.error("Erro ao usar habilidade:", error);
        res.status(500).json({ success: false, message: "Erro interno ao usar habilidade." });
    }
});


// Rota para resetar a batalha (voltar para a home sem batalha ativa)
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
    req.session.skillsOpen = null; // Ensures skills section is not open
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
// SKILLS ROUTES
// ----------------------------------------------------------------------

// Route to display the skills section
app.get("/skills/show", isAuthenticatedAndCharacterSelected, async (req, res) => {
    console.log("Route /skills/show accessed.");
    req.session.skillsOpen = true;
    req.session.battle = null; // Ensures battle is not active
    req.session.inventoryOpen = null; // Ensures inventory is not open
    res.redirect("/home");
});

// Route to hide the skills section
app.get("/skills/hide", isAuthenticatedAndCharacterSelected, (req, res) => {
    console.log("Route /skills/hide accessed.");
    req.session.skillsOpen = null;
    res.redirect("/home");
});

// Route for the character to learn a skill
app.post("/skills/learn", isAuthenticatedAndCharacterSelected, async (req, res) => {
    const { skillId } = req.body;

    try {
        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        const skillToLearn = await Skill.findById(skillId);

        if (!activeCharacter || !skillToLearn) {
            return res.status(404).json({ success: false, message: "Personagem ou habilidade não encontrados." });
        }

        // Check if the skill has already been learned
        if (activeCharacter.learnedSkills.includes(skillId)) {
            return res.status(400).json({ success: false, message: "Você já aprendeu esta habilidade." });
        }

        // Check if the character's class can learn this skill
        if (!skillToLearn.class.includes(activeCharacter.class)) {
            return res.status(403).json({ success: false, message: "Sua classe não pode aprender esta habilidade." });
        }

        // Check required level
        if (activeCharacter.level < skillToLearn.requiredLevel) {
            return res.status(400).json({ success: false, message: `Nível ${skillToLearn.requiredLevel} necessário para aprender esta habilidade.` });
        }

        // Add the skill to the character's learned skills
        activeCharacter.learnedSkills.push(skillId);
        await activeCharacter.save();

        // Return the updated character to the frontend
        const updatedCharacter = await Character.findById(req.session.activeCharacterId)
            .populate('learnedSkills')
            .populate('activeSkills');

        return res.status(200).json({ success: true, message: `Habilidade "${skillToLearn.name}" aprendida!`, character: updatedCharacter });

    } catch (error) {
        console.error("Erro ao aprender habilidade:", error);
        res.status(500).json({ success: false, message: "Erro interno ao aprender habilidade." });
    }
});

// Route to set active skills
app.post("/skills/set-active", isAuthenticatedAndCharacterSelected, async (req, res) => {
    const { skillId, slotIndex } = req.body;

    try {
        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        const skillToAdd = await Skill.findById(skillId);

        if (!activeCharacter || !skillToAdd) {
            return res.status(404).json({ success: false, message: "Personagem ou habilidade não encontrados." });
        }

        // Check if the skill has been learned
        if (!activeCharacter.learnedSkills.some(s => s._id.toString() === skillId)) {
            return res.status(400).json({ success: false, message: "Você não aprendeu esta habilidade." });
        }

        // Check if the skill is already active in any slot
        if (activeCharacter.activeSkills.some(s => s._id.toString() === skillId)) {
            return res.status(400).json({ success: false, message: "Esta habilidade já está ativa." });
        }

        // If the target slot is already occupied, remove the old skill from that slot
        if (activeCharacter.activeSkills[slotIndex]) {
            activeCharacter.activeSkills.splice(slotIndex, 1); // Remove the skill at that slot
        }

        // Add the new skill to the specified slot
        activeCharacter.activeSkills[slotIndex] = skillToAdd._id;
        
        // Filter out any null/undefined entries that might result from splice/assignment
        activeCharacter.activeSkills = activeCharacter.activeSkills.filter(s => s !== null && s !== undefined);
        
        // Ensure only unique skills are in activeSkills (in case of drag-and-drop issues)
        activeCharacter.activeSkills = [...new Set(activeCharacter.activeSkills.map(s => s.toString()))].map(s => new mongoose.Types.ObjectId(s));


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

        // Remove the skill from the active skills array
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
// Socket.IO Logic
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
// --- End of Socket.IO Logic ---


// ----------------------------------------------------------------------
// SERVER CONFIGURATION (Listen)
// ----------------------------------------------------------------------

const port = process.env.PORT || 5000;
server.listen(port, () => {
    console.log(`Server running on port: ${port}`);
});
