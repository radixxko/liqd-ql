'use strict';

let relat = {

    "users":
    {
        "user_accounts" : { "condition": [ "user_accounts.userID = users.id" ] }
    },
    "accounts":
    {
        "user_accounts" : { "condition": [ "user_accounts.accountID = accounts.id" ] }
    }
}


const test_path = require('../lib/relations.js');

const model_test = new test_path( relat );
let test = model_test.path( "users", "user_accounts" );
