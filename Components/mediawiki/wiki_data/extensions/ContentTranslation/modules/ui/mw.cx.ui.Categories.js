'use strict';

/**
 * CX Categories UI component.
 *
 * @class
 * @constructor
 *
 * @param {mw.cx.dm.Translation} translationModel
 * @param {Object} adaptedCategories Categories adapted on server side.
 * @param {Object} [config] Configuration options
 */
mw.cx.ui.Categories = function ( translationModel, adaptedCategories, config ) {
	this.translationModel = translationModel;
	this.adaptedCategories = adaptedCategories;
	this.config = config;

	// @var {OO.ui.ButtonWidget}
	this.sourceCategoryCount = null;
	// @var {OO.ui.ButtonWidget}
	this.targetCategoryCount = null;
	// @var {mw.cx.ui.CategoryMultiselectWidget}
	this.sourceCategoryListing = null;
	// @var {mw.cx.ui.CategoryMultiselectWidget}
	this.targetCategoryListing = null;

	this.translationModel.setSourceCategories( Object.keys( adaptedCategories ) );
	this.translationModel.setTargetCategories( this.extractTargetCategories( adaptedCategories ) );

	this.render();
	this.listen();
};

/**
 * @param {Object} adaptedCategories
 * @return {Array} Target categories
 */
mw.cx.ui.Categories.prototype.extractTargetCategories = function ( adaptedCategories ) {
	var source, target, categories = [];

	for ( source in adaptedCategories ) {
		target = adaptedCategories[ source ];
		if ( target ) {
			categories.push( target );
		}
	}

	return categories;
};

/**
 * For a given target (adapted) category, find corresponding source category.
 *
 * @param {string} targetCategory Target category name
 * @return {string|null} Corresponding source category name, or null
 */
mw.cx.ui.Categories.prototype.getCorrespondingSourceCategory = function ( targetCategory ) {
	var i, length, category,
		sourceCategories = this.translationModel.getSourceCategories();

	for ( i = 0, length = sourceCategories.length; i < length; i++ ) {
		category = sourceCategories[ i ];

		if ( this.adaptedCategories[ category ] === targetCategory ) {
			return category;
		}
	}

	return null;
};

/**
 * Example: "Category:Cakes" -> "Cakes"
 *
 * @param {string} fullCategoryName Category name with namespace prefix
 * @return {string} Category name, without namespace prefix
 */
mw.cx.ui.Categories.prototype.removeCategoryNamespace = function ( fullCategoryName ) {
	// mw.Title cannot be used because of T106644
	return fullCategoryName.match( /^.+?:(.*)$/ )[ 1 ];
};

/**
 * Create UI elements for category count buttons and category listings.
 */
mw.cx.ui.Categories.prototype.render = function () {
	var sourceCategories = this.translationModel.getSourceCategories(),
		targetCategories = this.translationModel.getTargetCategories();

	this.sourceCategoryCount = this.createCategoryCount( sourceCategories.length );
	this.targetCategoryCount = this.createCategoryCount( targetCategories.length );

	this.sourceCategoryListing = this.createCategoryListing(
		sourceCategories,
		true,
		{
			allowReordering: false,
			inputPosition: 'none'
		}
	);
	this.targetCategoryListing = this.createCategoryListing(
		targetCategories,
		false,
		{
			allowedValues: targetCategories,
			inputPosition: 'outline'
		}
	);

	this.checkForEmptySourceCategories();
	this.checkForEmptyTargetCategories();
	this.addMissingCategoriesToMenu();
};

/**
 * Create the category count button. To be displayed above source and translation contents.
 *
 * @param {Number} count
 * @return {OO.ui.ButtonWidget}
 */
mw.cx.ui.Categories.prototype.createCategoryCount = function ( count ) {
	return new OO.ui.ButtonWidget( {
		label: mw.msg( 'cx-tools-categories-count-message', mw.language.convertNumber( count ) ),
		icon: 'tag',
		framed: false
	} );
};

/**
 * @return {jQuery}
 */
mw.cx.ui.Categories.prototype.getSourceCategoryCount = function () {
	return this.sourceCategoryCount.$element;
};

/**
 * @return {jQuery}
 */
mw.cx.ui.Categories.prototype.getTargetCategoryCount = function () {
	return this.targetCategoryCount.$element;
};

/**
 * @param {Array} categories
 * @return {Array} Array of objects with data (full category name) and label (category name) properties
 */
mw.cx.ui.Categories.prototype.mapCategories = function ( categories ) {
	return categories.map( function ( category ) {
		return {
			data: category,
			label: this.removeCategoryNamespace( category )
		};
	}.bind( this ) );
};

/**
 * Get the category listing
 *
 * @param {Array} categories
 * @param {boolean} isSource True if source category listing should be created.
 * @param {Object} [config]
 * @return {mw.cx.ui.CategoryMultiselectWidget}
 */
mw.cx.ui.Categories.prototype.createCategoryListing = function ( categories, isSource, config ) {
	var categoryItems = this.mapCategories( categories );

	return new mw.cx.ui.CategoryMultiselectWidget( $.extend( {
		icon: 'tag',
		options: isSource ? categoryItems : [],
		selected: categoryItems.map( function ( item ) {
			return {
				label: item.label,
				data: item.data,
				config: {
					draggable: !isSource,
					hideRemoveButton: isSource,
					disabled: isSource && !this.adaptedCategories[ item.data ]
				}
			};
		}.bind( this ) ),
		classes: [ 'cx-category-listing' ]
	}, this.config, config ) );
};

/**
 * @return {jQuery}
 */
mw.cx.ui.Categories.prototype.getSourceCategoryListing = function () {
	return this.sourceCategoryListing.$element;
};

/**
 * @return {jQuery}
 */
mw.cx.ui.Categories.prototype.getTargetCategoryListing = function () {
	return this.targetCategoryListing.$element;
};

/**
 * Set disabled state for all category UI elements.
 *
 * @param {boolean} state
 */
mw.cx.ui.Categories.prototype.disableCategoryUI = function ( state ) {
	this.sourceCategoryCount.setDisabled( state );
	this.targetCategoryCount.setDisabled( state );
	this.sourceCategoryListing.setDisabled( state );
	this.targetCategoryListing.setDisabled( state );
};

/**
 * Event handling
 */
mw.cx.ui.Categories.prototype.listen = function () {
	this.sourceCategoryCount.connect( this, {
		click: function () {
			this.sourceCategoryListing.scrollElementIntoView();
		}
	} );
	this.targetCategoryCount.connect( this, {
		click: function () {
			this.targetCategoryListing.scrollElementIntoView();
		}
	} );

	this.sourceCategoryListing.connect( this, {
		itemSelect: 'onSourceCategoryClick',
		mouseEnter: [ 'toggleCategoryHighlight', this.targetCategoryListing, true ],
		mouseLeave: [ 'toggleCategoryHighlight', this.targetCategoryListing, false ]
	} );

	this.targetCategoryListing.connect( this, {
		change: 'onTargetCategoriesChange',
		mouseEnter: [ 'toggleCategoryHighlight', this.sourceCategoryListing, true ],
		mouseLeave: [ 'toggleCategoryHighlight', this.sourceCategoryListing, false ],
		itemRemove: [ 'toggleCategoryHighlight', this.sourceCategoryListing, false ]
	} );
};

/**
 * @param {mw.cx.ui.CategoryTagItemWidget} sourceTagItem
 */
mw.cx.ui.Categories.prototype.onSourceCategoryClick = function ( sourceTagItem ) {
	var sourceCategoryName = sourceTagItem.getData(),
		targetCategoryName = this.adaptedCategories[ sourceCategoryName ];

	this.targetCategoryListing.addTag(
		targetCategoryName,
		this.removeCategoryNamespace( targetCategoryName )
	);
};

/**
 * @param {mw.cx.ui.CategoryMultiselectWidget} categoryListing
 * @param {boolean} toggle Toggle highlight on/off (true/false)
 * @param {mw.cx.ui.CategoryTagItemWidget} tagItem
 */
mw.cx.ui.Categories.prototype.toggleCategoryHighlight = function ( categoryListing, toggle, tagItem ) {
	var correspondingTagItem,
		categoryName = tagItem.getData(),
		correspondingCategoryName =
			this.adaptedCategories[ categoryName ] ||
			this.getCorrespondingSourceCategory( categoryName );

	correspondingTagItem = categoryListing.findItemFromData( correspondingCategoryName );

	if ( !correspondingTagItem ) {
		return;
	}

	if ( toggle ) {
		tagItem.setFlags( 'highlight' );
		correspondingTagItem.setFlags( 'highlight' );
	} else {
		tagItem.clearFlags();
		correspondingTagItem.clearFlags();
	}
};

/**
 * @param {Array} selectedTargetCategories
 */
mw.cx.ui.Categories.prototype.onTargetCategoriesChange = function ( selectedTargetCategories ) {
	var targetCategories = selectedTargetCategories.map( function ( item ) { return item.data; } );

	this.targetCategoryCount.setLabel(
		mw.msg(
			'cx-tools-categories-count-message',
			mw.language.convertNumber( targetCategories.length )
		)
	);

	this.translationModel.setTargetCategories( targetCategories );
	this.addMissingCategoriesToMenu();
	this.checkForEmptyTargetCategories();
};

/**
 * Check if source categories listing is empty and display the informative message.
 */
mw.cx.ui.Categories.prototype.checkForEmptySourceCategories = function () {
	if ( this.sourceCategoryListing.getItemCount() === 0 ) {
		this.sourceCategoryListing.setLabel( mw.msg( 'cx-no-source-categories' ) );
	}
};

/**
 * Display the informative message if target categories listing is empty.
 */
mw.cx.ui.Categories.prototype.checkForEmptyTargetCategories = function () {
	if ( this.targetCategoryListing.getItemCount() > 0 ) {
		this.targetCategoryListing.setLabel( '' );
		return;
	}

	if ( this.sourceCategoryListing.allDisabled() ) {
		this.targetCategoryListing.setLabel( mw.msg( 'cx-no-adapted-categories' ) );
	} else {
		this.targetCategoryListing.setLabel( mw.msg( 'cx-no-target-categories' ) );
	}
};

/**
 * Find difference between all adapted target categories and selected adapted target categories.
 * Used to populate "Add category" menu in target category listing when input query is empty.
 */
mw.cx.ui.Categories.prototype.addMissingCategoriesToMenu = function () {
	var allTargetCategories = this.extractTargetCategories( this.adaptedCategories ),
		notSelectedTargetCategories = OO.simpleArrayDifference(
			allTargetCategories,
			this.translationModel.getTargetCategories()
		);

	this.targetCategoryListing.menu.clearItems();
	this.targetCategoryListing.addOptions( this.mapCategories( notSelectedTargetCategories ) );
};
