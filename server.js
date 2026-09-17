const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";
const db = new Database(path.join(__dirname, "homenest.db"));

db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('renter','landlord','admin')) DEFAULT 'renter',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  landlord_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  rent INTEGER NOT NULL,
  bedrooms INTEGER NOT NULL,
  bathrooms REAL NOT NULL,
  sqft INTEGER NOT NULL,
  available_date TEXT NOT NULL,
  description TEXT NOT NULL,
  amenities TEXT NOT NULL,
  image TEXT NOT NULL,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(landlord_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  PRIMARY KEY(user_id, property_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(property_id) REFERENCES properties(id)
);
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  renter_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(renter_id) REFERENCES users(id),
  FOREIGN KEY(property_id) REFERENCES properties(id)
);
CREATE TABLE IF NOT EXISTS tours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  renter_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  tour_date TEXT NOT NULL,
  status TEXT DEFAULT 'requested',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(renter_id) REFERENCES users(id),
  FOREIGN KEY(property_id) REFERENCES properties(id)
);
`);

function seed() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (count) return;
  const hash = bcrypt.hashSync("Demo1234!", 10);
  const landlord = db.prepare(
    "INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'landlord')"
  ).run("ABC Property Management", "landlord@homenest.demo", hash);
  const renter = db.prepare(
    "INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'renter')"
  ).run("Demo Renter", "renter@homenest.demo", hash);
  const insert = db.prepare(`
    INSERT INTO properties
    (landlord_id,title,address,city,state,zip,rent,bedrooms,bathrooms,sqft,available_date,description,amenities,image,verified)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const listings = [
    ["Beautiful 2-Bedroom Apartment","123 Main Street","Chicago","IL","60607",1850,2,1,950,"2026-10-01","Bright downtown apartment with skyline views, modern kitchen and private balcony.","Parking,In-Unit Laundry,Dishwasher,Air Conditioning,Pet Friendly,Balcony","https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=80",1],
    ["Modern Lincoln Park Apartment","455 Clark Street","Chicago","IL","60614",2300,3,2,1200,"2026-10-15","Spacious three-bedroom near parks, restaurants and transit.","Gym,Parking,Pool,Dishwasher,Pet Friendly","https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80",1],
    ["River North Studio","88 River Road","Chicago","IL","60654",1600,1,1,750,"2026-10-05","Efficient studio with full amenities in a convenient River North location.","Elevator,AC,Laundry,Doorman","https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80",0]
  ];
  for (const l of listings) insert.run(landlord.id, ...l);
}
seed();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function auth(req,res,next) {
  const token = (req.headers.authorization || "").replace("Bearer ","");
  if (!token) return res.status(401).json({error:"Authentication required"});
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({error:"Invalid or expired session"}); }
}

app.post("/api/register", async (req,res)=>{
  const {name,email,password,role="renter"} = req.body;
  if (!name || !email || !password) return res.status(400).json({error:"Name, email and password are required"});
  if (!["renter","landlord"].includes(role)) return res.status(400).json({error:"Invalid role"});
  try {
    const hash = await bcrypt.hash(password,10);
    const info = db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)").run(name,email.toLowerCase(),hash,role);
    const user = {id:info.lastInsertRowid,name,email:email.toLowerCase(),role};
    const token = jwt.sign(user,JWT_SECRET,{expiresIn:"7d"});
    res.json({token,user});
  } catch(e) { res.status(400).json({error:"Email is already registered"}); }
});

app.post("/api/login", async (req,res)=>{
  const {email,password} = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email=?").get((email||"").toLowerCase());
  if (!user || !(await bcrypt.compare(password||"",user.password_hash))) return res.status(401).json({error:"Incorrect email or password"});
  const safe = {id:user.id,name:user.name,email:user.email,role:user.role};
  res.json({token:jwt.sign(safe,JWT_SECRET,{expiresIn:"7d"}),user:safe});
});

app.get("/api/listings",(req,res)=>{
  const {city,minRent,maxRent,bedrooms} = req.query;
  let sql = `SELECT p.*, u.name landlord_name FROM properties p JOIN users u ON u.id=p.landlord_id WHERE 1=1`;
  const args=[];
  if(city){sql+=" AND lower(p.city)=lower(?)";args.push(city);}
  if(minRent){sql+=" AND p.rent>=?";args.push(Number(minRent));}
  if(maxRent){sql+=" AND p.rent<=?";args.push(Number(maxRent));}
  if(bedrooms && bedrooms!=="Any"){sql+=" AND p.bedrooms>=?";args.push(Number(bedrooms));}
  sql+=" ORDER BY p.created_at DESC";
  const rows=db.prepare(sql).all(...args).map(p=>({...p,amenities:p.amenities.split(",")}));
  res.json(rows);
});

app.get("/api/listings/:id",(req,res)=>{
  const p=db.prepare(`SELECT p.*,u.name landlord_name,u.email landlord_email FROM properties p JOIN users u ON u.id=p.landlord_id WHERE p.id=?`).get(req.params.id);
  if(!p) return res.status(404).json({error:"Listing not found"});
  p.amenities=p.amenities.split(",");
  res.json(p);
});

app.get("/api/me/favorites",auth,(req,res)=>{
  const rows=db.prepare(`SELECT p.* FROM favorites f JOIN properties p ON p.id=f.property_id WHERE f.user_id=? ORDER BY p.created_at DESC`).all(req.user.id);
  res.json(rows);
});

app.post("/api/favorites/:id",auth,(req,res)=>{
  const existing=db.prepare("SELECT 1 FROM favorites WHERE user_id=? AND property_id=?").get(req.user.id,req.params.id);
  if(existing) db.prepare("DELETE FROM favorites WHERE user_id=? AND property_id=?").run(req.user.id,req.params.id);
  else db.prepare("INSERT INTO favorites(user_id,property_id) VALUES(?,?)").run(req.user.id,req.params.id);
  res.json({saved:!existing});
});

app.post("/api/inquiries",auth,(req,res)=>{
  if(req.user.role!=="renter") return res.status(403).json({error:"Only renters can contact landlords"});
  const {propertyId,message}=req.body;
  if(!propertyId||!message) return res.status(400).json({error:"Property and message are required"});
  db.prepare("INSERT INTO inquiries(renter_id,property_id,message) VALUES(?,?,?)").run(req.user.id,propertyId,message);
  res.json({ok:true});
});

app.post("/api/tours",auth,(req,res)=>{
  if(req.user.role!=="renter") return res.status(403).json({error:"Only renters can request tours"});
  const {propertyId,tourDate}=req.body;
  if(!propertyId||!tourDate) return res.status(400).json({error:"Property and date are required"});
  db.prepare("INSERT INTO tours(renter_id,property_id,tour_date) VALUES(?,?,?)").run(req.user.id,propertyId,tourDate);
  res.json({ok:true});
});

app.get("/api/dashboard",auth,(req,res)=>{
  if(req.user.role==="landlord"){
    const properties=db.prepare("SELECT * FROM properties WHERE landlord_id=? ORDER BY created_at DESC").all(req.user.id);
    const inquiries=db.prepare(`SELECT i.*,p.title,r.name renter_name,r.email renter_email FROM inquiries i JOIN properties p ON p.id=i.property_id JOIN users r ON r.id=i.renter_id WHERE p.landlord_id=? ORDER BY i.created_at DESC`).all(req.user.id);
    const tours=db.prepare(`SELECT t.*,p.title,r.name renter_name FROM tours t JOIN properties p ON p.id=t.property_id JOIN users r ON r.id=t.renter_id WHERE p.landlord_id=? ORDER BY t.tour_date`).all(req.user.id);
    return res.json({role:"landlord",properties,inquiries,tours});
  }
  const favorites=db.prepare(`SELECT p.* FROM favorites f JOIN properties p ON p.id=f.property_id WHERE f.user_id=?`).all(req.user.id);
  const inquiries=db.prepare(`SELECT i.*,p.title FROM inquiries i JOIN properties p ON p.id=i.property_id WHERE i.renter_id=? ORDER BY i.created_at DESC`).all(req.user.id);
  const tours=db.prepare(`SELECT t.*,p.title FROM tours t JOIN properties p ON p.id=t.property_id WHERE t.renter_id=? ORDER BY t.tour_date`).all(req.user.id);
  res.json({role:"renter",favorites,inquiries,tours});
});

app.post("/api/listings",auth,(req,res)=>{
  if(!["landlord","admin"].includes(req.user.role)) return res.status(403).json({error:"Landlord account required"});
  const {title,address,city,state,zip,rent,bedrooms,bathrooms,sqft,availableDate,description,amenities,image}=req.body;
  if(!title||!address||!city||!state||!zip||!rent||bedrooms===undefined||!bathrooms||!sqft||!availableDate||!description) return res.status(400).json({error:"Please complete all required fields"});
  const info=db.prepare(`INSERT INTO properties(landlord_id,title,address,city,state,zip,rent,bedrooms,bathrooms,sqft,available_date,description,amenities,image) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(req.user.id,title,address,city,state,zip,Number(rent),Number(bedrooms),Number(bathrooms),Number(sqft),availableDate,description,(amenities||[]).join(","),image||"https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1200&q=80");
  res.json({id:info.lastInsertRowid});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`HomeNest running at http://localhost:${PORT}`));
