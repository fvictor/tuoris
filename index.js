const args = require('yargs')

  .strict(true)

  .option('variables', {
    alias: 'v', describe: 'Set of variables passed to the visualization', type: 'array', default: []
  })

  .option('folders', {
    alias: 'f', describe: 'Set the folders that will be mounted in the server', type: 'array', default: ['public']
  })

  .option('interactive', {
    alias: 'i', describe: 'Set interactive mode', type: 'boolean', default: false
  })

  .option('localfileurls', {
    alias: 'l', describe: 'Use local file urls', type: 'boolean', default: false
  })

  .option('port', {
    alias: 'p', describe: 'Set port (>= 0 and < 65536)', type: 'number', default: 8080
  })

  .option('default', {
    alias: 'd', describe: 'Set default visualization', type: 'string', default: 'default.html'
  })

  .check((arg) => {
    if (!(Number.isInteger(arg.port) && arg.port >= 0 && arg.port < 65536)) {
      throw new Error('The value specified is not a valid port');
    }

    if (arg.variables && arg.variables.some(variableValue => !variableValue.includes('='))) {
      throw new Error('Variables must be defined as variable=value');
    }

    return true;
  })

  .showHelpOnFail(false, 'Specify --help for available options')

  .help()

  .argv;

const variables = args.variables ? Object.assign({}, ...args.variables.map(i => i.split('=')).map(i => ({ [i[0]]: i[1] }))) : {};

require('./server.js').VisualizationServer.initializeServer(args.port, args.interactive, args.default, args.folders, args.localfileurls, variables);
