'use strict';

const QL = require('../lib/ql');


class RModel extends QL.Model
{
    constructor()
    {
        super();

        this.a = 'b';
    }

    forUsers()
    {
        return 'RModel::forUsers';
    }

    jozko()
    {
        return '';
    }
}

class Model2 extends RModel
{
    constructor()
    {
        super();
    }

    model2()
    {

    }
}

const model = new Model2();

console.log( model.forUsers() );
