'use strict';

function getPropertiesInChain( obj, properties = new Set() )
{
    Object.getOwnPropertyNames( obj ).forEach( p => properties.add( p ));
    obj.__proto__ && getPropertiesInChain( obj.__proto__, properties );

    return properties;
}

module.exports = class QLModel
{
    constructor()
    {
        let properties = getPropertiesInChain( this.constructor.prototype );

        if( !properties.has( 'forUsers' ))
        {
            Object.defineProperty( this, 'forUsers',
            {
                writable: false,
                value: () =>
                {
                    return 'QLModel::forUsers'
                }
            });
        }
    }

    testik()
    {

    }
}
