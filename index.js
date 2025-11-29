const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// DB file
const dbFile = path.join(__dirname, "db.json");

let dbData = {
  wallet: { balance: 450 },
  transactions: [],
  drivers: [
    {
      id: "1",
      name: "Ravi",
      car: "Dzire",
      rating: 4.7,
      available: true,
      location: { lat: 28.6139, lng: 77.209 },
    },
    {
      id: "2",
      name: "Amit",
      car: "WagonR",
      rating: 4.5,
      available: true,
      location: { lat: 28.6135, lng: 77.21 },
    },
    {
      id: "3",
      name: "Suresh",
      car: "Alto",
      rating: 4.2,
      available: true,
      location: { lat: 28.614, lng: 77.2085 },
    },
  ],
  rides: [],
  users: [],
};

// load db
if (fs.existsSync(dbFile)) {
  dbData = JSON.parse(fs.readFileSync(dbFile));
}

function saveDB() {
  fs.writeFileSync(dbFile, JSON.stringify(dbData, null, 2));
}

// JWT
const SECRET = "dev-key";

function token(user) {
  return jwt.sign({ id: user.id, email: user.email }, SECRET, {
    expiresIn: "7d",
  });
}

function auth(req, res, next) {
  try {
    const t = req.headers.authorization?.split(" ")[1];
    if (!t) return res.status(401).send({ error: "No token" });
    req.user = jwt.verify(t, SECRET);
    next();
  } catch {
    res.status(401).send({ error: "Invalid token" });
  }
}

// ROOT
app.get("/", (req, res) => {
  res.send("Taxi backend running!");
});

// SIGNUP
app.post("/api/signup", async (req, res) => {
  const { name, email, password } = req.body;

  const exists = dbData.users.find((u) => u.email === email);
  if (exists) return res.status(400).send({ error: "Email exists" });

  const user = {
    id: nanoid(),
    name,
    email,
    password: await bcrypt.hash(password, 8),
  };

  dbData.users.push(user);
  saveDB();

  res.send({ token: token(user), user });
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const user = dbData.users.find((u) => u.email === email);
  if (!user) return res.status(401).send({ error: "Wrong email" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).send({ error: "Wrong password" });

  res.send({ token: token(user), user });
});

// WALLET
app.get("/api/wallet", auth, (req, res) => res.send(dbData.wallet));

app.post("/api/wallet/topup", auth, (req, res) => {
  const { amount } = req.body;
  dbData.wallet.balance += amount;

  dbData.transactions.push({
    id: nanoid(),
    type: "topup",
    amount,
    createdAt: new Date().toISOString(),
  });

  saveDB();
  res.send({ balance: dbData.wallet.balance });
});

// TRANSACTIONS
app.get("/api/transactions", auth, (req, res) => {
  res.send(dbData.transactions);
});

// DRIVERS
app.get("/api/drivers", (req, res) => res.send(dbData.drivers));

// FARE HELPERS
function randomFare() {
  return (Math.floor(Math.random() * 10) + 1) * 15;
}

function eta() {
  return Math.floor(Math.random() * 10) + 2;
}

// REQUEST RIDE
app.post("/api/rides/request", auth, (req, res) => {
  const { from, to } = req.body;

  const fare = randomFare();

  if (dbData.wallet.balance < fare) {
    return res.status(400).send({ error: "Low balance" });
  }

  const driver = dbData.drivers.find((d) => d.available);
  if (!driver) return res.status(400).send({ error: "No drivers" });

  driver.available = false;

  const ride = {
    id: nanoid(),
    userId: req.user.id,
    from,
    to,
    fare,
    status: "requested",
    driver,
    createdAt: new Date().toISOString(),
    etaMinutes: eta(),
  };

  dbData.wallet.balance -= fare;
  dbData.transactions.push({
    id: nanoid(),
    type: "ride",
    amount: fare,
    createdAt: new Date().toISOString(),
  });

  dbData.rides.push(ride);
  saveDB();
  res.send(ride);
});

// USER RIDES
app.get("/api/rides", auth, (req, res) => {
  const rides = dbData.rides.filter((r) => r.userId === req.user.id);
  res.send(rides);
});

// COMPLETE RIDE
app.post("/api/rides/complete/:id", auth, (req, res) => {
  const ride = dbData.rides.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).send({ error: "Not found" });

  ride.status = "completed";
  ride.driver.available = true;

  saveDB();
  res.send({ ok: true, ride });
});

// CANCEL RIDE
app.post("/api/rides/cancel/:id", auth, (req, res) => {
  const ride = dbData.rides.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).send({ error: "Not found" });

  ride.status = "cancelled";
  ride.driver.available = true;
  dbData.wallet.balance += ride.fare;

  saveDB();
  res.send({ ok: true, ride });
});

// SERVER PORT FOR RENDER
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log("Server running on", PORT));
