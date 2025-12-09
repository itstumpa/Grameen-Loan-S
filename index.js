const express = require('express');
require('dotenv').config();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;


const crypto = require("crypto");
// const admin = require("firebase-admin");
// import admin from "firebase-admin";
const admin = require("../Grameen_Loan_S/firebase/firebaseAdmin");


// const serviceAccount = require("./firebase-adminsdk.json");

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });
credential: admin.credential.cert({
  project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
})



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


// const verifyFBToken = async (req, res, next) => {
//   // console.log(('headers in the middleware', req.headers.authorization))
//   const token = req.headers.authorization?.split(' ')[1];
//   if (!token) {
//     return res.status(401).send({ message: 'unauthorized access' });
//   }

//   try {
//     // Verify Firebase token
//     const decodedToken = await admin.auth().verifyIdToken(token);
//     req.decoded_email = decodedToken.email;

//     console.log('Decoded email:', req.decoded_email); // Debug
//     console.log('Query email:', req.query.email); // Debug

//     next();
//   } catch (error) {
//     console.error('Token verification error:', error);
//     return res.status(401).send({ message: 'Invalid token' });
//   }
// };



const verifyFBToken = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).send({ message: "Unauthorized access" });
    }

    const token = authorization.split(" ")[1];

    const decoded = await admin.auth().verifyIdToken(token);

    req.decoded_email = decoded.email;
    req.decoded_uid = decoded.uid;

    next();

  } catch (err) {
    console.error("Firebase verify token error:", err);
    return res.status(401).send({ message: "Invalid or expired token" });
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
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db('grameen-loan-db');
    const userCollection = db.collection('users');
    const loanCollection = db.collection('all-loans');
     const loanApplicationCollection = db.collection('loan-applications');
    // const parcelsCollection = db.collection('parcels');
    // const paymentCollection = db.collection('payments');
    // const ridersCollection = db.collection('riders');


    app.get('/', (req, res) => {
      res.send('Server is running properly 🚀');
    });



    // Get all users
app.get('/users', async (req, res) => {
  try {
    const users = await userCollection.find().toArray();  // ✅ CORRECT
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

// Your existing routes (already correct)
app.post('/users', async (req, res) => {
  const user = req.body;
  user.role = 'user';
  user.createdAt = new Date();
  const userExists = await userCollection.findOne({ email: user.email });
  if (userExists) {
    return res.status(409).send({ message: 'User already exists' });
  }
  const result = await userCollection.insertOne(user);
  res.send(result);
});



app.get('/users/:email', async (req, res) => {
  try {
    const email = req.params.email;
    const user = await userCollection.findOne({ email: email });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const isAdmin = user?.role === 'admin';
    res.json({ admin: isAdmin, user: user });  // Send user data too
    
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user (role & status)
// Update user profile by email
app.patch('/users/:email', async (req, res) => {
  try {
    const email = req.params.email;
    const updateData = req.body;

    console.log('📥 Updating user:', email);
    console.log('📦 Update data:', updateData);

    // Update user in database
    const result = await userCollection.updateOne(
      { email: email },
      { 
        $set: {
          name: updateData.name,
          photoURL: updateData.photoURL,
          phone: updateData.phone,
          address: updateData.address,
          dateOfBirth: updateData.dateOfBirth,
          occupation: updateData.occupation,
          monthlyIncome: updateData.monthlyIncome,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      console.log('❌ User not found:', email);
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    console.log('✅ User updated successfully:', email);
    
    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Error updating user:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Delete user
app.delete('/users/:email', async (req, res) => {
  try {
    const email = req.params.email;
    const result = await userCollection.deleteOne({ email: email });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('✅ User deleted:', email);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------------------- 



app.get('/all-loans', async (req, res) => {
  try {
    const loans = await loanCollection.find().toArray();  // MongoDB query
    res.json(loans);
  } catch (error) {
        console.error('Error fetching loans:', error);
    res.status(500).json({ error: error.message });
  }
});


// Get single loan by ID
app.get('/all-loans/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const loan = await loanCollection.findOne(query);
    
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    
    res.json(loan);
  } catch (error) {
    console.error('Error fetching loan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new loan
app.post('/all-loans', async (req, res) => {
  try {
    const loan = req.body;
    loan.createdAt = new Date();
    const result = await loanCollection.insertOne(loan);
    res.json(result);
  } catch (error) {
    console.error('Error creating loan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update loan
app.patch('/all-loans/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = req.body;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = { $set: updateData };
    const result = await loanCollection.updateOne(filter, updateDoc);
    res.json(result);
  } catch (error) {
    console.error('Error updating loan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete loan
app.delete('/all-loans/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await loanCollection.deleteOne(query);
    res.json(result);
  } catch (error) {
    console.error('Error deleting loan:', error);
    res.status(500).json({ error: error.message });
  }
});


 // Create loan application
    app.post('/loan-applications', async (req, res) => {
      try {
        console.log('📥 Received loan application:', req.body);
        
        const application = req.body;
        
        // Validate required fields
        if (!application.userEmail || !application.loanId || !application.firstName) {
          return res.status(400).json({ 
            message: 'Missing required fields',
            required: ['userEmail', 'loanId', 'firstName']
          });
        }
        
        // Insert into database
        const result = await loanApplicationCollection.insertOne(application);
        
        console.log('✅ Loan application created:', result.insertedId);
        
        res.status(201).json({
          success: true,
          message: 'Application submitted successfully',
          insertedId: result.insertedId
        });
        
      } catch (error) {
        console.error('❌ Error creating application:', error);
        res.status(500).json({ 
          success: false,
          message: 'Failed to submit application',
          error: error.message 
        });
      }
    });

    // Get all loan applications (admin)
    app.get('/loan-applications', async (req, res) => {
      try {
        const applications = await loanApplicationCollection
          .find()
          .sort({ appliedAt: -1 })
          .toArray();
        
        console.log(`✅ Found ${applications.length} applications`);
        res.json(applications);
      } catch (error) {
        console.error('❌ Error fetching applications:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get applications by user email
    app.get('/loan-applications/user/:email', async (req, res) => {
      try {
        const email = req.params.email;
        console.log('📥 Fetching applications for:', email);
        
        const applications = await loanApplicationCollection
          .find({ userEmail: email })
          .sort({ appliedAt: -1 })
          .toArray();
        
        console.log(`✅ Found ${applications.length} applications for ${email}`);
        res.json(applications);
      } catch (error) {
        console.error('❌ Error fetching user applications:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get single application by ID
    app.get('/loan-applications/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const application = await loanApplicationCollection.findOne({ 
          _id: new ObjectId(id) 
        });
        
        if (!application) {
          return res.status(404).json({ message: 'Application not found' });
        }
        
        res.json(application);
      } catch (error) {
        console.error('❌ Error fetching application:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Update application status (admin)
    app.patch('/loan-applications/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updateData = req.body;
        
        const result = await loanApplicationCollection.updateOne(
          { _id: new ObjectId(id) },
          { 
            $set: {
              ...updateData,
              updatedAt: new Date()
            }
          }
        );
        
        if (result.matchedCount === 0) {
          return res.status(404).json({ message: 'Application not found' });
        }
        
        console.log('✅ Application updated:', id);
        res.json({ 
          success: true,
          message: 'Application updated successfully' 
        });
      } catch (error) {
        console.error('❌ Error updating application:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete application
    app.delete('/loan-applications/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await loanApplicationCollection.deleteOne({ 
          _id: new ObjectId(id) 
        });
        
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: 'Application not found' });
        }
        
        console.log('✅ Application deleted:', id);
        res.json({ 
          success: true,
          message: 'Application deleted successfully' 
        });
      } catch (error) {
        console.error('❌ Error deleting application:', error);
        res.status(500).json({ error: error.message });
      }
    });


    // users api start here 
//     app.get("/parcels", async (req, res) => {
//       const query = {};
//       const email = req.query.email;
//       if (email) {
//         query.senderEmail = email;
//       }
//       // console.log(query)
//       const options = {
//         sort: { createdAt: -1 },
//       };
//       const cursor = parcelsCollection.find(query, options);
//       const result = await cursor.toArray();
//       res.send(result);
//     });

//     app.post("/parcels", async (req, res) => {
//       try {
//         const parcel = req.body;
//         // parcel created time 
//         parcel.createdAt = new Date();
//         const result = await parcelsCollection.insertOne(parcel);
//         res.send(result);
//       } catch (error) {
//         console.log(error);
//         res.status(500).send({ error: "Failed to add parcel" });
//       }
//     });



//     app.get('/parcels/:id', async (req, res) => {
//       //  try {
//       const id = req.params.id;
//       const query = { _id: new ObjectId(id) };
//       console.log('query', query)
//       const result = await parcelsCollection.findOne(query);

//       if (!result) {
//         return res.status(404).send({ message: "Job not found" });
//       }

//       res.send(result);

//     });


//     // ✅ Delete one job by ID
//     app.delete("/parcels/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const query = { _id: new ObjectId(id) };
//         const result = await parcelsCollection.deleteOne(query);
//         res.send(result);
//       } catch (error) {
//         console.error(error);
//         res.status(500).send({ message: "Failed to delete job" });
//       }
//     });

//     // PAYMENT RELATED API 
//     app.post("/create-checkout-session", async (req, res) => {
//       try {
//         const paymentInfo = req.body;
//         console.log(paymentInfo)
//         const amount = parseInt(paymentInfo.cost) * 100; // Convert to cents
//         const session = await stripe.checkout.sessions.create({
//           line_items: [
//             {
//               price_data: {
//                 currency: 'usd',
//                 unit_amount: amount,
//                 // unit_amount: paymentInfo.amount * 100,
//                 product_data: {
//                   name: paymentInfo.parcelName,
//                 },
//               },

//               quantity: 1,
//             },
//           ],
//           customer_email: paymentInfo.senderEmail,
//           mode: 'payment',
//           metadata: {
//             parcelId: paymentInfo.parcelId,
//             parcelName: paymentInfo.parcelName
//           },
//           success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
//           cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
//         });
//         console.log(session)
//         return res.send({ url: session.url }); // ← Add return
//       } catch (error) {
//         console.error(error);
//         return res.status(500).send({ success: false, error: error.message }); // ← Add error handling
//       }
//     });


//     // riders rellated apis 
// app.get('/riders', async (req, res) => {
//       const query = {};
//       if (req.query.status) {
//         query.status = req.query.status;
//       }
//       const cursor = ridersCollection.find(query);
//       const result = await cursor.toArray();
//       res.send(result);
//     });


//     app.patch('/riders/:id', async (req, res) => {
//       const status = req.body.status;  
//       console.log(status)
//       const id = req.params.id;
//       const query = { _id: new ObjectId(id) };
//       const updatedDoc = {
//         $set: {
//           status: status,
//         },
//       };
//       const result = await ridersCollection.updateOne(query, updatedDoc);

//       if (status === 'approved') {
//         const email = req.body.email;
//         const userQuery = { email };
//         console.log(email)
//         const updateUser = {

//           $set: { role: 'rider' },
//         };
//         const userResult = await userCollection.updateOne(userQuery, updateUser);
//       }


//       res.send(result);
//     });


//     app.post('/riders', async (req, res) => {
//       const rider = req.body;
//       rider.status = 'pending';
//       rider.createdAt = new Date();

//       const result = await ridersCollection.insertOne(rider);
//       res.send(result);
//     });

//     app.get('/payments', verifyFBToken, async (req, res) => {
//       try {
//         const email = req.query.email;

//         console.log('Request email:', email);
//         console.log('Decoded email:', req.decoded_email);

//         if (!email) {
//           return res.status(400).send({ message: 'Email parameter required' });
//         }

//         // Check if emails match
//         if (email !== req.decoded_email) {
//           console.log('Email mismatch!');
//           console.log('Query email:', email);
//           console.log('Token email:', req.decoded_email);
//           return res.status(403).send({
//             message: 'Forbidden access',
//             details: 'Email in query does not match authenticated user'
//           });
//         }

//         const query = { customer_email: email };
//         console.log('Query:', query);

//         const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
//         const result = await cursor.toArray();

//         return res.send(result);

//       } catch (error) {
//         console.error('Error in /payments:', error);
//         return res.status(500).send({ message: 'Server error', error: error.message });
//       }
//     });


//     app.patch('/payment-success', async (req, res) => {
//       try {
//         const sessionId = req.query.session_id;

//         if (!sessionId) {
//           return res.status(400).send({ success: false, message: 'Session ID required' });
//         }

//         const session = await stripe.checkout.sessions.retrieve(sessionId);
//         // console.log('session retrieve', session);
//         const transactionId = session.payment_intent;
//         const query = { transactionId: transactionId };
//         const paymentExist = await paymentCollection.findOne(query);
//         console.log(paymentExist)
//         if (paymentExist) {
//           return res.send({
//             message: 'Payment already recorded', transactionId,
//             trackingId: paymentExist.trackingId
//           });
//         }

//         const trackingId = generateTrackingId;

//         if (session.payment_status === 'paid') {
//           const id = session.metadata.parcelId;
//           const query = { _id: new ObjectId(id) };
//           const update = {
//             $set: {
//               paymentStatus: 'Paid',
//               trackingId: trackingId(),
//             },
//           };
//           const result = await parcelsCollection.updateOne(query, update);

//           const payment = {
//             amount: session.amount_total / 100,
//             currency: session.currency,
//             transactionId: session.payment_intent,
//             parcelId: session.metadata.parcelId,
//             parcelName: session.metadata.parcelName,
//             paymentStatus: session.payment_status,
//             customer_email: session.customer_email,
//             paidAt: new Date(),
//             trackingId: trackingId(),
//           }

//           if (session.payment_status === 'paid') {
//             const resultPayment = await paymentCollection.insertOne(payment);

//             return res.send({
//               success: true,
//               modifyparcel: result,
//               trackingId: trackingId(),
//               transactionId: session.payment_intent,
//               paymentInfo: resultPayment
//             });
//           }

//         }

//         // Only reaches here if payment_status is NOT 'paid'
//         return res.send({ success: false, message: 'Payment not completed' }); // ← Add return

//       } catch (err) {
//         console.error(err);
//         return res.status(500).send({ success: false, error: err.message }); // ← Add return and handle error properly
//       }
//     });

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
