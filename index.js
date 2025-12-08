const express = require('express');
require('dotenv').config();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;


const crypto = require("crypto");
const admin = require("firebase-admin");

const serviceAccount = require("./firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


function generateTrackingId() {
  const prefix = "PRCL"; // your brand prefix
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

  return `${prefix}-${date}-${random}`;
}

// middleware 
app.use(cors({
  origin: ["http://localhost:5173"],
  credentials: true,
}));
app.use(express.json());


const verifyFBToken = async (req, res, next) => {
  // console.log(('headers in the middleware', req.headers.authorization))
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  try {
    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.decoded_email = decodedToken.email;

    console.log('Decoded email:', req.decoded_email); // Debug
    console.log('Query email:', req.query.email); // Debug

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).send({ message: 'Invalid token' });
  }
};


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ielazur.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


async function run() {
  try {
    // await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db('grameeen-loan-db');
    const userCollection = db.collection('users');
    const loanCollection = db.collection('all-loans');
    // const parcelsCollection = db.collection('parcels');
    // const paymentCollection = db.collection('payments');
    // const ridersCollection = db.collection('riders');


    app.get('/', (req, res) => {
      res.send('Server is running properly 🚀');
    });


    // user related apis 
    app.post('/users', async (req, res) => {
      const user = req.body;
      user.role = 'user';
      user.createdAt = new Date();
      const email = user.email;
      const userExists = await userCollection.findOne({ email: user.email });
      if (userExists) {
        return res.status(409).send({ message: 'User already exists' });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === 'admin') {
        isAdmin = true;
      }
      res.send({ admin: isAdmin });
    });


    // users api start here 
    app.get("/parcels", async (req, res) => {
      const query = {};
      const email = req.query.email;
      if (email) {
        query.senderEmail = email;
      }
      // console.log(query)
      const options = {
        sort: { createdAt: -1 },
      };
      const cursor = parcelsCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/parcels", async (req, res) => {
      try {
        const parcel = req.body;
        // parcel created time 
        parcel.createdAt = new Date();
        const result = await parcelsCollection.insertOne(parcel);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ error: "Failed to add parcel" });
      }
    });



    app.get('/parcels/:id', async (req, res) => {
      //  try {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      console.log('query', query)
      const result = await parcelsCollection.findOne(query);

      if (!result) {
        return res.status(404).send({ message: "Job not found" });
      }

      res.send(result);

    });


    // ✅ Delete one job by ID
    app.delete("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await parcelsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to delete job" });
      }
    });

    // PAYMENT RELATED API 
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const paymentInfo = req.body;
        console.log(paymentInfo)
        const amount = parseInt(paymentInfo.cost) * 100; // Convert to cents
        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: 'usd',
                unit_amount: amount,
                // unit_amount: paymentInfo.amount * 100,
                product_data: {
                  name: paymentInfo.parcelName,
                },
              },

              quantity: 1,
            },
          ],
          customer_email: paymentInfo.senderEmail,
          mode: 'payment',
          metadata: {
            parcelId: paymentInfo.parcelId,
            parcelName: paymentInfo.parcelName
          },
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
        });
        console.log(session)
        return res.send({ url: session.url }); // ← Add return
      } catch (error) {
        console.error(error);
        return res.status(500).send({ success: false, error: error.message }); // ← Add error handling
      }
    });


    // riders rellated apis 
app.get('/riders', async (req, res) => {
      const query = {};
      if (req.query.status) {
        query.status = req.query.status;
      }
      const cursor = ridersCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });


    app.patch('/riders/:id', async (req, res) => {
      const status = req.body.status;  
      console.log(status)
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: status,
        },
      };
      const result = await ridersCollection.updateOne(query, updatedDoc);

      if (status === 'approved') {
        const email = req.body.email;
        const userQuery = { email };
        console.log(email)
        const updateUser = {

          $set: { role: 'rider' },
        };
        const userResult = await userCollection.updateOne(userQuery, updateUser);
      }


      res.send(result);
    });


    app.post('/riders', async (req, res) => {
      const rider = req.body;
      rider.status = 'pending';
      rider.createdAt = new Date();

      const result = await ridersCollection.insertOne(rider);
      res.send(result);
    });

    app.get('/payments', verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email;

        console.log('Request email:', email);
        console.log('Decoded email:', req.decoded_email);

        if (!email) {
          return res.status(400).send({ message: 'Email parameter required' });
        }

        // Check if emails match
        if (email !== req.decoded_email) {
          console.log('Email mismatch!');
          console.log('Query email:', email);
          console.log('Token email:', req.decoded_email);
          return res.status(403).send({
            message: 'Forbidden access',
            details: 'Email in query does not match authenticated user'
          });
        }

        const query = { customer_email: email };
        console.log('Query:', query);

        const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
        const result = await cursor.toArray();

        return res.send(result);

      } catch (error) {
        console.error('Error in /payments:', error);
        return res.status(500).send({ message: 'Server error', error: error.message });
      }
    });


    app.patch('/payment-success', async (req, res) => {
      try {
        const sessionId = req.query.session_id;

        if (!sessionId) {
          return res.status(400).send({ success: false, message: 'Session ID required' });
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        // console.log('session retrieve', session);
        const transactionId = session.payment_intent;
        const query = { transactionId: transactionId };
        const paymentExist = await paymentCollection.findOne(query);
        console.log(paymentExist)
        if (paymentExist) {
          return res.send({
            message: 'Payment already recorded', transactionId,
            trackingId: paymentExist.trackingId
          });
        }

        const trackingId = generateTrackingId;

        if (session.payment_status === 'paid') {
          const id = session.metadata.parcelId;
          const query = { _id: new ObjectId(id) };
          const update = {
            $set: {
              paymentStatus: 'Paid',
              trackingId: trackingId(),
            },
          };
          const result = await parcelsCollection.updateOne(query, update);

          const payment = {
            amount: session.amount_total / 100,
            currency: session.currency,
            transactionId: session.payment_intent,
            parcelId: session.metadata.parcelId,
            parcelName: session.metadata.parcelName,
            paymentStatus: session.payment_status,
            customer_email: session.customer_email,
            paidAt: new Date(),
            trackingId: trackingId(),
          }

          if (session.payment_status === 'paid') {
            const resultPayment = await paymentCollection.insertOne(payment);

            return res.send({
              success: true,
              modifyparcel: result,
              trackingId: trackingId(),
              transactionId: session.payment_intent,
              paymentInfo: resultPayment
            });
          }

        }

        // Only reaches here if payment_status is NOT 'paid'
        return res.send({ success: false, message: 'Payment not completed' }); // ← Add return

      } catch (err) {
        console.error(err);
        return res.status(500).send({ success: false, error: err.message }); // ← Add return and handle error properly
      }
    });

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
