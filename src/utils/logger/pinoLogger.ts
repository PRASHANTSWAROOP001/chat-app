import pino from "pino";


const transport:any = pino.transport({
    targets:[
        {
            target: 'pino/file',
            level:"info",
            options:{destination:"logs/app.log"}
        },
        {
            target: 'pino-pretty',
            level: 'debug',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              singleLine: false, // optional: format logs cleaner
              ignore: 'pid,hostname'
            }
        }   
    ]
})

const logger = pino(transport);

export default logger;