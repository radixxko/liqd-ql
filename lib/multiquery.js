module.exports = class MultiQuery
{
    #DB; #queries = [];

    constructor( DB, rows, table )
    {
        this.#DB = DB;
        
        for( let row of rows )
        {
            this.#queries.push( this.#DB.query([ row ], table ));
        }
    }

    _apply( method, ...args )
    {
        for( let query of this.#queries )
        {
            query[method]( ...args );
        }

        return this;
    }

    limit( ...args ){ return this._apply( 'limit', ...args )}
    order_by( ...args ){ return this._apply( 'order_by', ...args )}
    group_by( ...args ){ return this._apply( 'group_by', ...args )}
    inner_join( ...args ){ return this._apply( 'inner_join', ...args )}
    where( ...args ){ return this._apply( 'where', ...args )}

    async select( columns )
    {
        return this.#DB.query().union( await Promise.all( this.#queries.map( query => query.select_query( columns, null, ' ' )))).select();
    }
}