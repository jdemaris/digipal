/**
 * Code used on the various search pages
 * (main search, record pages, graph search, browse images)
 */

$(document).ready(function() {

	// Autocomplete for the search input box
	// Everywhere on the site + the search page
	var suggestions_limit = 8;
	
	// return true if the scope of the quick search is the database
	function is_searching_database() {
	    return !$('[name=scp]').val();
	}
	
	function get_suggestions(query, cb) {
	    // returns suggestions only if we are searching the database
	    // so no suggestion for blog/news
	    if (is_searching_database()) {
    	    $.getJSON('/digipal/search/suggestions.json', {q: query, l: suggestions_limit}, function(data) {
    	        var ret = [];
    	        $.each(data, function(i, str) {
    	            ret.push({txt: str.replace(/<\/?strong>/g, ''), html: str});
    	        });
    	        cb(ret);
    	    });
	    } else {
	        cb([]);
	    }
	}

	if ($.fn.typeahead) {
		$("#search-terms").typeahead({
		    minlength: 1,
			limit: suggestions_limit
		}, {
		    name: 'dbrecords',
		    source: get_suggestions,
		    displayKey: 'txt',
		    templates: {
		        suggestion: function(suggestion) {
                    return '<p style="white-space: normal;">' + suggestion.html + '</p>';
		        }
		    }
		});
	}

	// Scrolls directly to the results on second or later pages.
	// Scrolls to an element with id="auto-scroll" 
    var page = dputils.get_query_string_param('page');      
    if (page && (page!='1')) {
        var auto_scroll = $('#auto-scroll');
        if (auto_scroll.length) {
            // scroll to the results
            $("html, body").scrollTop(auto_scroll.offset().top);
        }
    }
    
    // clear-all button is clicked, we reset the form and empty the breadcrumb.
    // JIRA 484
    $('.breadcrumb .clear-all').on('click', function() {
        // remove the filters in the breadcrumb
        $('.breadcrumb a').remove();
        $('.breadcrumb').append('All');
        // remove the ',' between the filters we have removed. 
        $('.breadcrumb').html($('.breadcrumb').html().replace(',', ''));
        
        // reset the selects in the form
        $('#searchform select').val('');
        $('#searchform select').trigger("liszt:updated");
        // clear the query text
        $('#searchform input[type=text]').val('');
        return false;
    });
	
});


/*
 * This function is called by the main search page to:
 *  do some initialisations
 *  make the page work without reload
 */
function init_search_page(options) {

	window.sp_options = options;

	/*
		Example:

		init_search_page({
			advanced_search_expanded: {{ advanced_search_expanded }},
			filters: [
				{
					html: '{{ filterHands.as_ul|escapejs }}',
					label: 'Hands',
				},
				{
					html: '{{ filterManuscripts.as_ul|escapejs }}',
					label: 'Manuscripts',
				},
				{
					html: '{{ filterScribes.as_ul|escapejs }}',
					label: 'Scribes',
				}
			},
			linked_fields: [
			        {
			            'fields': ['chartype', 'character'], 
			            'values': {
			                        u'abbreviation': [u'7', u'th\xe6t'], 
			                        u'ligature': [u'&', u'ligature'], 
			                        u'accent': [u'accent'], 
			                        u'punctuation': [u'.', u'?', u'./', u';', u'abbrev. stroke'], 
		            }
			    ]
		});
	*/

	function set_up() {
        // update the advanced search hidden field
	    $('#filter-toggler').on('click', function (e) {
            $('#advanced').val(!$('#advancedSearch').is(':visible'));
            // show/hide the advanced search panel
            $('#advancedSearch').slideToggle();
        });
        
        // Update the list of dropdowns in the advanced search panel
        // each time a tab is selected. 
	    $('#searchform a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
			var container = $('#containerFilters ul');

			var content = '';
			var label = '';
			for (var i in window.sp_options.filters) {
				var filter = window.sp_options.filters[i];
				if ($(this).data('filter-key') == filter.key) {
		            $('#basic_search_type').val(filter.key);
					content += filter.html;
					break;
				}
			}
			container.html(content);

			$('select').chosen();
		});

		// Clicking a tab displays its content
		// and we set the selected tab in a hidden form field
		$('#result-types-switch a').click(function(e) {
			e.preventDefault();
			$('#searchform input[name=result_type]').val($(this).attr('data-target').replace('#', ''));
		});

		// Set focus on the search box. Place the cursor at the end.
		// Add a whitespace after the last search term.
		var search_box = $('#search-terms');
		var search_terms = $('#search-terms').val().replace(/^\s+|\s+$/g, '') + ' ';
		if (search_terms == ' ') search_terms = '';
		
		var page = dputils.get_query_string_param('page');		
		if (!page || (page=='1')) {
		    search_box.val(search_terms).focus();
		}
		
	    set_up_linked_fields(options.linked_fields);
	}

	$(document).ready(function() {
		set_up();
	});
}

/* Browse Images, Search Graph pages and Record page */
$(function() {
    // Browse or Search Graph pages
	// When the user switches to a view, that view is stored in a hidden input field.
	// This allows the page to preserve the view across searches.
	$('#view-switch a[data-target]').on('click', function() {
	    $('#searchform input[name=view]').attr('value', $(this).attr('href').replace(/.*view=([^&#]*).*/, '$1'));
	});

	// Annotation mode should be persistent across page loads
    $('#toggle-annotations-mode').on('change', function() {
        // So any change in the toggle widget should be reflected in the hidden field in the main form
        $('#searchform input[name=am]').attr('value', $(this).is(':checked') ? '1' : '0');
    });

    // Browse image
	// When the user clicks the pagination, we set the view and annotation mode 
    // in the query string before following the link.
	$('.pagination a, .pagination-group a').on('click', function() {
	    var $clicked = $(this);
		var href = $clicked.attr('href');
		$('form input[type=hidden][class=sticky]').each(function () {
		    var name = $(this).attr('name');
	        var replace = name+'=' + $(this).attr('value');
	        if (replace) {
	            href = (href.indexOf(name+'=') == -1) ? href + '&' + replace : href.replace(new RegExp(name+'=[^&#]*','g'), replace);
	        }
		});
        $clicked.attr('href', href);
	});

	// Record page
    // When the user clicks the previous/next pagination, we set the tab in the 
	// query string before following the link.
	// This way the same tabs remains open on the next record we visit.
    $('.record-view .previous a, .record-view .next a').on('click', function() {
        // extract the webpath (tab) after the record id from the current URL
        // e.g. '/hands/'
        // we get the current tab from the currently active tab rather than the
        // current document URL because of cases like:
        // http://127.0.0.1:8000/digipal/manuscripts/1464/descriptions/?s=1&result_type=manuscripts
        // where it's more difficult to extract the right number.
        //var tab = document.location.href.replace(/.*?\d+([^?]+).*/, '$1');
        var tab = $('#record-tab-switch li.active a').attr('href');
        if (tab) { 
            tab = tab.replace(/.*?\d+([^?]+).*/, '$1'); 
        }
        var href = $(this).attr('href');
        if (tab && href) {
            // overwrite that path in the previous/next links
            $(this).attr('href', href.replace(/(\/\d+)[^?]+/, '$1'+tab))
        }
    });

});