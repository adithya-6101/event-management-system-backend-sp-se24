const User = require('../models/User'); // Import the user model
require('dotenv').config()
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { promisify } = require("util");
const UserOTPVerification = require("../models/UserOtpVerification")
const nodemailer = require('nodemailer');

exports.register = async (req, res) => {
    try {
        const { email, username, password, confirmPassword, role } = req.body;

        // Check if user with the provided email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log("User exists ", email);
            return res.status(400).send("User exists");
        }

        // Check if passwords match
        if (password !== confirmPassword) {
            console.log("Passwords do not match");
            return res.status(400).send("Passwords do not match");
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 8);
        const verified = false;
        // Create a new user document
        await User.create({ username, email, password: hashedPassword, role, verified});

        console.log("User registered");
        return res.status(200).send("User registered");
    } catch (error) {
        console.log(error);
        return res.status(500).send("Internal Server Error");
    }
};

// without otp

// exports.login = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         // Find user by email
//         const user = await User.findOne({ email });

//         if (!user || !await bcrypt.compare(password, user.password)) {
//             return res.status(400).send("Invalid email or password");
//         }

//         // Generate JWT token
//         const token = jwt.sign({ id: user._id }, process.env.ENV_JWT_SECRET, {
//             expiresIn: process.env.ENV_JWT_EXPIRES_IN
//         });

//         console.log("the token is " + token);

//         // Set cookie with JWT token
//         res.cookie('userSave', token, {
//             expires: new Date(Date.now() + 86400 * 1000),
//             httpOnly: true
//         });

//         console.log("logged in");
//         return res.status(200).redirect("/");
//     } catch (error) {
//         console.log(error);
//         return res.status(500).send("Internal Server Error");
//     }
// };

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email });

        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(400).send("Invalid email or password");
        }

        // Send OTP verification email
        await sendOtpVerificationEmail(user, res);

    } catch (error) {
        console.log(error);
        return res.status(500).send("Internal Server Error");
    }
};

exports.verify = async(req, res) => {
    try {
        let {userId, otp} = req.body;
        if(!userId || !otp){
            throw Error("empty otp");
        } else{
            const userOtpVerificationRecord = await UserOTPVerification.find({
                userId
            });
            if(userOtpVerificationRecord.length <=0){
                throw new Error("accound invalid or already verified")
            } else{
                const expiresAt = userOtpVerificationRecord[0];
                const hashedOtp = userOtpVerificationRecord[0].otp;
                if(expiresAt < Date.now){
                    await userOtpVerification.deletemany({userId});
                    throw new Error("code expired");
                }else{
                    const validOtp = bcrypt.compare(otp, hashedOtp);
                    if(!validOtp){
                        throw new Error("invalid otp");
                    }else{ 
                        await User.updateOne({_id: userId}, {verified:true});
                        UserOTPVerification.deleteMany({ userId});
                        res.json({
                            status:"verified",
                            message: "success "
                        });
                    }
                }
            }
        }
    } catch (error) {
        res.json({
            status:"falied",
            message: error.message
        });
    }
};


const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.ENV_MAIL_USER,
        pass: process.env.ENV_MAIL_PASS,
    },
});

const sendOtpVerificationEmail = async ({_id, email}, res) => {
    try {
        const otp = `${Math.floor(1000 + Math.random()*9000)}`;
        const mailOptions = {
            from: process.env.ENV_MAIL_USER,
            to: email,
            subject: 'Two-factor OTP Request',
            html: `
              <p>You have requested to receive a two-factor OTP.</p>
              <p>Enter the following OTP to authenticate:</p>
              <p>${otp}</p>
              <p>If you didn't request a two-factor OTP, please ignore this email.</p>
            `,
        };

        const saltRounds = 10 ;
        const hashedOtp = await bcrypt.hash(otp, saltRounds);

        const newOtpVerification = await new UserOTPVerification({
            userId:_id,
            otp:hashedOtp,
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600000
        });

        await newOtpVerification.save();
        await transporter.sendMail(mailOptions);
        res.json({
            status : "pending",
            msg : "mail sent",
            data : {
                userId : _id,
                email
            }
        });
    } catch (error) {
        res.json({
            status : "failed",
            msg :  error.message,
            
        })
    }
}

exports.isLoggedIn = async (req, res, next) => {
    try {
        if (req.cookies.userSave) {
            // 1. Verify the token
            const decoded = await promisify(jwt.verify)(req.cookies.userSave, process.env.ENV_JWT_SECRET);

            // 2. Check if the user exists in the database
            const user = await User.findById(decoded.id);
            if (!user) {
                return next();
            }

            req.user = user;
            return next();
        } else {
            return next();
        }
    } catch (error) {
        console.log(error);
        return res.status(500).send("Internal Server Error");
    }
};

exports.logout = (req, res) => {
    res.clearCookie('userSave');
    res.status(200).redirect("/");
};
