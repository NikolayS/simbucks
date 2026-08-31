#!/bin/sh
set -e

cd "$(dirname "$0")"
sed -e "s#from 'three'#from './three.js'#" \
    -e "s#from '../entities/people.js'#from './people.js'#" \
    -e "s#from './orders.js'#from '../../src/game/orders.js'#" \
    -e "s#from './state.js'#from '../../src/game/state.js'#" \
    ../../src/game/customers.js > customers.sim.js
