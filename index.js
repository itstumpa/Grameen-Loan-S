const express = require('express');
require('dotenv').config();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); 

const app = express();
const port = process.env.PORT || 3000;


const crypto = require("crypto");
const admin = require("../Grameen_Loan_S/firebase/firebaseAdmin");


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
    // console.error("Firebase verify token error:", err);
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
      const paymentCollection = db.collection('payments');


  // middle admin before allowing admin activity
        // must be used after verifyFBToken middleware
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded_email;
            const query = { email };
            const user = await userCollection.findOne(query);

            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' });
            }

            next();
        }
        const verifyManager = async (req, res, next) => {
            const email = req.decoded_email;
            const query = { email };
            const user = await userCollection.findOne(query);

            if (!user || user.role !== 'manager') {
                return res.status(403).send({ message: 'forbidden access' });
            }

            next();
        }
         const verifyUser = async (req, res, next) => {
            const email = req.decoded_email;
            const query = { email };
            const user = await userCollection.findOne(query);

            if (!user || user.role !== 'user') {
                return res.status(403).send({ message: 'forbidden access' });
            }

            next();
        }

   
    app.get('/', (req, res) => {
      res.send('Server is running properly');
    });



    // Get all users
app.get('/users', verifyFBToken, async (req, res) => {
  try {
    const users = await userCollection.find().toArray();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});


 app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await userCollection.findOne(query);
            res.send({ role: user?.role || 'user' })
        })

app.post('/users', async (req, res) => {
  try {
    const user = req.body;
     user.role = 'user';
    
    // Check if user already exists
    const existingUser = await userCollection.findOne({ email: user.email });
    
    if (existingUser) {
      return res.status(409).json({ 
        success: false,
        message: 'User already exists' 
      });
    }
    
    user.createdAt = new Date();
    user.updatedAt = new Date();
    
    const result = await userCollection.insertOne(user);
    
    res.status(201).json({ 
      success: true,
      message: 'User created successfully',
      insertedId: result.insertedId
    });
    
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

  app.patch('/users/:id/role', verifyFBToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const roleInfo = req.body;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: roleInfo.role
                }
            }
            const result = await userCollection.updateOne(query, updatedDoc)
            res.send(result);
        })


app.get('/users/:email', async (req, res) => {
  try {
    const email = req.params.email;
    const user = await userCollection.findOne({ email: email });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const isAdmin = user?.role === 'admin';
    res.json({ admin: isAdmin, user: user });
    
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user profile by email
app.patch('/users/:email', async (req, res) => {
  try {
    const email = req.params.email;
    const updateData = req.body;

    // Update or CREATE user in database 
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
        },
        $setOnInsert: {
          email: email,
          role: 'user',
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
    } else {
    }
    
    res.json({ 
      success: true, 
      message: result.upsertedCount > 0 ? 'User created' : 'Profile updated successfully',
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount
    });

  } catch (error) {
    console.error('Error updating user:', error);
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

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------------------- 



app.get('/all-loans', async (req, res) => {
  try {
    const loans = await loanCollection.find().toArray();
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
// ------------------------------------------------------------------- 

 // Create loan application
    app.post('/loan-applications', async (req, res) => {
      try {
        
        const application = req.body;
        
        if (!application.userEmail || !application.loanId || !application.firstName) {
          return res.status(400).json({ 
            message: 'Missing required fields',
            required: ['userEmail', 'loanId', 'firstName']
          });
        }
        
        const result = await loanApplicationCollection.insertOne(application);
        
        
        res.status(201).json({
          success: true,
          message: 'Application submitted successfully',
          insertedId: result.insertedId
        });
        
      } catch (error) {
        console.error('Error creating application:', error);
        res.status(500).json({ 
          success: false,
          message: 'Failed to submit application',
          error: error.message 
        });
      }
    });

    // Get all loan applications admin
    app.get('/loan-applications', async (req, res) => {
      try {
        const applications = await loanApplicationCollection
          .find()
          .sort({ appliedAt: -1 })
          .toArray();
        
        res.json(applications);
      } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get applications by user email
    app.get('/loan-applications/user/:email', async (req, res) => {
      try {
        const email = req.params.email;
        
        const applications = await loanApplicationCollection
          .find({ userEmail: email })
          .sort({ appliedAt: -1 })
          .toArray();
        
        res.json(applications);
      } catch (error) {
        console.error('Error fetching user applications:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get single application by ID
    app.get('/loan-applications/:id', async (req, res) => {
      try {
        const id = req.params.id;
         const query = { _id: new ObjectId(id) };
        const application = await loanApplicationCollection.findOne(query)
          
        
        if (!application) {
          return res.status(404).json({ message: 'Application not found' });
        }
        
        res.json(application);
      } catch (error) {
        console.error('Error fetching application:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Update application status admin
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
        
        res.json({ 
          success: true,
          message: 'Application updated successfully' 
        });
      } catch (error) {
        console.error('Error updating application:', error);
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
        
        res.json({ 
          success: true,
          message: 'Application deleted successfully' 
        });
      } catch (error) {
        console.error('Error deleting application:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // --------------------------------------------------------------------------



    // PAYMENT RELATED API 
  app.post("/create-checkout-session", async (req, res) => {
  try {
    const paymentInfo = req.body;
    
    //  VALIDATION
    if (!paymentInfo.cost || !paymentInfo.applicationName || !paymentInfo.senderEmail) {
      return res.status(400).send({ 
        success: false, 
        error: 'Missing required fields: cost, applicationName, or senderEmail' 
      });
    }

    //  LOGGING
    
    const amount = parseInt(paymentInfo.cost) * 100;
    
    //  AMOUNT
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).send({ 
        success: false, 
        error: 'Invalid amount' 
      });
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: {
              name: paymentInfo.applicationName,
            },
          },
          quantity: 1,
        },
      ],
      customer_email: paymentInfo.senderEmail,
      mode: 'payment',
      metadata: {
        applicationId: paymentInfo.applicationId,
        applicationName: paymentInfo.applicationName
      },
      success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
    });
    
    
    return res.send({ success: true, url: session.url }); 
    
  } catch (error) {
    console.error('Stripe Error:', error.message);
    return res.status(500).send({ 
      success: false, 
      error: error.message 
    });
  }
});


    
    app.patch('/payment-success', async (req, res) => {
  try {
    const sessionId = req.query.session_id;

    if (!sessionId) {
      return res.status(400).send({ success: false, message: 'Session ID required' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const transactionId = session.payment_intent;
    
    const paymentExist = await paymentCollection.findOne({ transactionId });
    
    if (paymentExist) {
      return res.send({
        success: true,
        message: 'Payment already recorded',
        transactionId,
        trackingId: paymentExist.trackingId
      });
    }

    if (session.payment_status === 'paid') {
      const trackingId = generateTrackingId();
      
      const applicationId = session.metadata.applicationId;
      const query = { _id: new ObjectId(applicationId) };
      
      const update = {
        $set: {
          paymentStatus: 'Paid',
          trackingId: trackingId,
        },
      };
      
      const result = await loanApplicationCollection.updateOne(query, update);

      const payment = {
        amount: session.amount_total / 100,
        currency: session.currency,
        transactionId: session.payment_intent,
        applicationId: applicationId,
        applicationName: session.metadata.applicationName,
        paymentStatus: session.payment_status,
        customer_email: session.customer_email,
        paidAt: new Date(),
        trackingId: trackingId,
      };

      const resultPayment = await paymentCollection.insertOne(payment);

      return res.send({
        success: true,
        modifiedApplication: result,
        trackingId: trackingId,
        transactionId: session.payment_intent,
        paymentInfo: resultPayment
      });
    }

    return res.send({ success: false, message: 'Payment not completed' });

  } catch (err) {
    console.error('Payment Success Error:', err);
    return res.status(500).send({ success: false, error: err.message });
  }
});
    // ---------------------------------------------------------------------------------------- 




  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
