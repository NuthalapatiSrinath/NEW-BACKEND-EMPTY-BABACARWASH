const dotenv = require('dotenv')
dotenv.config() // Load .env file if it exists

const config = {
    env: process.env.ENV,
    port: Number(process.env.PORT),
    database: {
        mongo: {
            uri: process.env.MONGO_URI,
            debug: false,
            options: {
                authSource: "admin",
                useNewUrlParser: true,
                useUnifiedTopology: true,
                useCreateIndex: true,
                useFindAndModify: false
            }
        }
    },
    keys: {
        secret: process.env.SECRET_KEY
    },
    AWS: {
        id: process.env.AWS_ACCESS_KEY_ID,
        key: process.env.AWS_SECRET_KET,
        bucket: "bcw"
    },
    smtp: {
        host: process.env.SMTP_HOST,
        username: process.env.SMTP_USERNAME,
        password: process.env.SMTP_PASSWORD,
        email: process.env.SMTP_USERNAME
    },

}

module.exports = config